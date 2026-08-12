import type { UpdateLeadRequest } from '../../../shared/contracts/appContracts';
import type {
  Campaign,
  CampaignType,
  Lead,
  OptionItem,
  SevaWorkspaceContext
} from './types';

const CARD_LONG_PRESS_MS = 500;
const CARD_MOVE_TOLERANCE_PX = 10;

function getSelectedRecords(context: SevaWorkspaceContext): Lead[] {
  return context.leads.filter((lead) => context.selectedIds.has(lead.id));
}

function getAllowedVolunteers(context: SevaWorkspaceContext) {
  const configured = context.appConfig.volunteers || [];
  if (configured.length) {
    return configured.map((volunteer) => ({
      email: volunteer.email.trim().toLowerCase(),
      name: volunteer.name.trim()
    }));
  }
  return [...new Set(context.appConfig.allowedUsers || [])].map((email) => ({
    email: String(email || '')
      .trim()
      .toLowerCase(),
    name: String(email || '').split('@')[0] || 'Volunteer'
  }));
}

function toUpdateRequest(
  context: SevaWorkspaceContext,
  lead: Lead,
  campaign: Campaign
): UpdateLeadRequest {
  const snapshot = context.createLeadSnapshot(lead);
  return {
    id: lead.id,
    name: snapshot.name,
    status: snapshot.status,
    quality: snapshot.quality,
    followUp: snapshot.followUp,
    notes: snapshot.notes,
    campaignId: campaign.id,
    campaignType: campaign.type,
    wishlistPrograms: context.getProgramListForSave(snapshot.wishlistPrograms),
    donePrograms: context.getProgramListForSave(snapshot.donePrograms)
  };
}

export function createRecordActionMethods() {
  return {
    selectedCount(this: SevaWorkspaceContext): number {
      return this.selectedIds.size;
    },
    isSelectionMode(this: SevaWorkspaceContext): boolean {
      return this.selectedIds.size > 0;
    },
    isLeadSelected(this: SevaWorkspaceContext, lead: Lead): boolean {
      return this.selectedIds.has(lead.id);
    },
    toggleLeadSelection(this: SevaWorkspaceContext, lead: Lead): void {
      const next = new Set(this.selectedIds);
      if (next.has(lead.id)) {
        next.delete(lead.id);
      } else {
        next.add(lead.id);
      }
      this.selectedIds = next;
      this.isFabOpen = false;
    },
    clearSelection(this: SevaWorkspaceContext): void {
      this.selectedIds = new Set<string>();
      this.cancelCardLongPress();
    },
    handleCardPointerDown(
      this: SevaWorkspaceContext,
      event: PointerEvent,
      lead: Lead
    ): void {
      if (event.button !== 0 || this.isBulkActionPending) {
        return;
      }
      this.suppressCardClickLeadId = '';
      if (!this.isSelectionMode()) {
        this.activateCard(lead);
      }
      this.cancelCardLongPress();
      this.cardLongPressStart = { x: event.clientX, y: event.clientY };
      this.cardLongPressTimer = setTimeout(() => {
        this.cardLongPressTimer = null;
        this.suppressCardClickLeadId = lead.id;
        if (!this.selectedIds.has(lead.id)) {
          this.toggleLeadSelection(lead);
        }
        window.getSelection?.()?.removeAllRanges();
      }, CARD_LONG_PRESS_MS);
    },
    handleCardPointerMove(
      this: SevaWorkspaceContext,
      event: PointerEvent
    ): void {
      if (!this.cardLongPressStart) {
        return;
      }
      const movedX = Math.abs(event.clientX - this.cardLongPressStart.x);
      const movedY = Math.abs(event.clientY - this.cardLongPressStart.y);
      if (movedX > CARD_MOVE_TOLERANCE_PX || movedY > CARD_MOVE_TOLERANCE_PX) {
        this.cancelCardLongPress();
      }
    },
    cancelCardLongPress(this: SevaWorkspaceContext): void {
      if (this.cardLongPressTimer) {
        clearTimeout(this.cardLongPressTimer);
      }
      this.cardLongPressTimer = null;
      this.cardLongPressStart = null;
    },
    handleCardClick(
      this: SevaWorkspaceContext,
      event: MouseEvent,
      lead: Lead
    ): void {
      this.cancelCardLongPress();
      if (this.suppressCardClickLeadId === lead.id) {
        this.suppressCardClickLeadId = '';
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggleLeadSelection(lead);
        return;
      }
      if (!this.isSelectionMode()) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggleLeadSelection(lead);
    },
    openMoveCampaignSheet(this: SevaWorkspaceContext): void {
      const destinations = this.campaigns.filter(
        (campaign) =>
          campaign.type === this.campaignType &&
          campaign.id !== this.selectedCampaignId
      );
      if (!destinations.length) {
        this.authError = 'No other Seva is available for these records.';
        return;
      }
      this.optionSheetMode = 'moveCampaign';
      this.optionSheetTitle =
        'Move ' + String(this.selectedCount()) + ' selected';
      this.optionSheetOptions = destinations.map(
        (campaign: Campaign): OptionItem => ({
          value: campaign.id,
          label: campaign.name
        })
      );
      this.currentOptionValue = '';
      this.activeOptionLead = null;
      this.isOptionSheetOpen = true;
    },
    openReassignVolunteerSheet(this: SevaWorkspaceContext): void {
      const assignedEmails = new Set(
        getSelectedRecords(this).map((lead) =>
          lead.assignedVolunteerEmail.trim().toLowerCase()
        )
      );
      const volunteers = getAllowedVolunteers(this).filter(
        (volunteer) => !assignedEmails.has(volunteer.email)
      );
      if (!volunteers.length) {
        this.authError =
          'No other volunteers are available in the allowed list.';
        return;
      }
      this.optionSheetMode = 'reassignVolunteer';
      this.optionSheetTitle =
        'Reassign ' + String(this.selectedCount()) + ' selected';
      this.optionSheetOptions = volunteers
        .map((volunteer) => ({
          value: volunteer.email,
          label: volunteer.name
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      this.currentOptionValue = '';
      this.activeOptionLead = null;
      this.isOptionSheetOpen = true;
    },
    async moveSelectedRecords(
      this: SevaWorkspaceContext,
      campaignId: string
    ): Promise<void> {
      const campaign = this.campaigns.find((item) => item.id === campaignId);
      const records = getSelectedRecords(this);
      if (!campaign || campaign.type !== this.campaignType || !records.length) {
        return;
      }
      this.isBulkActionPending = true;
      this.authError = '';
      this.actionMessage = '';
      try {
        if (!(await this.flushPendingSaves())) {
          this.authError = 'Save pending edits before moving these records.';
          return;
        }
        const results = await Promise.allSettled(
          records.map((lead) =>
            window.appRuntime.updateLead(toUpdateRequest(this, lead, campaign))
          )
        );
        const movedIds = new Set(
          records
            .filter((_, index) => results[index].status === 'fulfilled')
            .map((lead) => lead.id)
        );
        this.leads = this.leads.filter((lead) => !movedIds.has(lead.id));
        if (movedIds.has(this.activeCardId)) {
          this.activeCardId = '';
        }
        this.selectedIds = new Set(
          [...this.selectedIds].filter((id) => !movedIds.has(id))
        );
        if (results.some((result) => result.status === 'rejected')) {
          this.authError =
            'Some records could not be moved. The remaining records stay selected.';
        } else {
          const movedNoun = movedIds.size === 1 ? 'record' : 'records';
          this.actionMessage =
            String(movedIds.size) +
            ' ' +
            movedNoun +
            ' moved to ' +
            campaign.name +
            '.';
          this.clearSelection();
        }
      } finally {
        this.isBulkActionPending = false;
      }
    },
    async deleteSelectedRecords(this: SevaWorkspaceContext): Promise<void> {
      const records = getSelectedRecords(this);
      if (!records.length) {
        return;
      }
      const noun = records.length === 1 ? 'record' : 'records';
      if (
        !window.confirm('Delete ' + records.length + ' selected ' + noun + '?')
      ) {
        return;
      }
      this.isBulkActionPending = true;
      this.authError = '';
      this.actionMessage = '';
      try {
        if (!(await this.flushPendingSaves())) {
          this.authError = 'Save pending edits before deleting these records.';
          return;
        }
        const results: PromiseSettledResult<unknown>[] = [];
        for (const lead of records) {
          try {
            const value = await window.appRuntime.deleteLead({
              id: lead.id,
              campaignType: lead.campaignType
            });
            results.push({ status: 'fulfilled', value });
          } catch (reason) {
            results.push({ status: 'rejected', reason });
          }
        }
        const deletedIds = new Set(
          records
            .filter((_, index) => results[index].status === 'fulfilled')
            .map((lead) => lead.id)
        );
        this.leads = this.leads.filter((lead) => !deletedIds.has(lead.id));
        if (deletedIds.has(this.activeCardId)) {
          this.activeCardId = '';
        }
        this.selectedIds = new Set(
          [...this.selectedIds].filter((id) => !deletedIds.has(id))
        );
        if (results.some((result) => result.status === 'rejected')) {
          this.authError =
            'Some records could not be deleted. The remaining records stay selected.';
        } else {
          const deletedNoun = deletedIds.size === 1 ? 'record' : 'records';
          this.actionMessage =
            String(deletedIds.size) + ' ' + deletedNoun + ' deleted.';
          this.clearSelection();
        }
      } finally {
        this.isBulkActionPending = false;
      }
    },
    async reassignSelectedRecords(
      this: SevaWorkspaceContext,
      volunteerEmail: string
    ): Promise<void> {
      const normalizedEmail = String(volunteerEmail || '')
        .trim()
        .toLowerCase();
      const records = getSelectedRecords(this);
      const campaign = this.campaigns.find(
        (item) => item.id === this.selectedCampaignId
      );
      if (
        !records.length ||
        !campaign ||
        !getAllowedVolunteers(this).some(
          (volunteer) => volunteer.email === normalizedEmail
        )
      ) {
        this.authError = 'Select a volunteer from the allowed list.';
        return;
      }

      this.isBulkActionPending = true;
      this.authError = '';
      this.actionMessage = '';
      try {
        if (!(await this.flushPendingSaves())) {
          this.authError =
            'Save pending edits before reassigning these records.';
          return;
        }
        const results = await Promise.allSettled(
          records.map((lead) =>
            window.appRuntime.updateLead({
              ...toUpdateRequest(this, lead, campaign),
              assignedVolunteerEmail: normalizedEmail
            })
          )
        );
        const reassignedIds = new Set(
          records
            .filter((_, index) => results[index].status === 'fulfilled')
            .map((lead) => lead.id)
        );
        records.forEach((lead) => {
          if (reassignedIds.has(lead.id)) {
            lead.assignedVolunteerEmail = normalizedEmail;
          }
        });
        if (normalizedEmail !== this.volunteerEmail.toLowerCase()) {
          this.leads = this.leads.filter((lead) => !reassignedIds.has(lead.id));
          if (reassignedIds.has(this.activeCardId)) {
            this.activeCardId = '';
          }
        }
        this.selectedIds = new Set(
          [...this.selectedIds].filter((id) => !reassignedIds.has(id))
        );
        if (results.some((result) => result.status === 'rejected')) {
          this.authError =
            'Some records could not be reassigned. The remaining records stay selected.';
        } else {
          const volunteer = getAllowedVolunteers(this).find(
            (item) => item.email === normalizedEmail
          );
          const reassignedNoun =
            reassignedIds.size === 1 ? 'record' : 'records';
          this.actionMessage =
            String(reassignedIds.size) +
            ' ' +
            reassignedNoun +
            ' reassigned to ' +
            (volunteer?.name || normalizedEmail) +
            '.';
          this.clearSelection();
        }
      } finally {
        this.isBulkActionPending = false;
      }
    },
    getCreateCampaigns(
      this: SevaWorkspaceContext,
      type: CampaignType = this.createRecordType
    ): Campaign[] {
      return this.campaigns.filter((campaign) => campaign.type === type);
    },
    openCreateRecord(this: SevaWorkspaceContext, type: CampaignType): void {
      const campaigns = this.getCreateCampaigns(type);
      if (!campaigns.length) {
        this.authError =
          'No ' + type.toLowerCase() + ' Seva is available for this record.';
        return;
      }
      const preferred = campaigns.find(
        (campaign: Campaign) => campaign.id === this.selectedCampaignId
      );
      this.createRecordType = type;
      this.createRecordDraft = {
        name: '',
        mobile: '',
        notes: '',
        campaignId: (preferred || campaigns[0])?.id || ''
      };
      this.isFabOpen = false;
      this.isCreateRecordModalOpen = true;
    },
    closeCreateRecord(this: SevaWorkspaceContext): void {
      if (!this.isCreateRecordSaving) {
        this.isCreateRecordModalOpen = false;
      }
    },
    async saveCreatedRecord(this: SevaWorkspaceContext): Promise<void> {
      const name = this.createRecordDraft.name.trim();
      const mobile = this.createRecordDraft.mobile.trim();
      if (!name || !mobile || !this.createRecordDraft.campaignId) {
        this.authError = 'Name, mobile, and destination Seva are required.';
        return;
      }
      this.isCreateRecordSaving = true;
      this.authError = '';
      this.actionMessage = '';
      try {
        const response = await window.appRuntime.createLead({
          name,
          mobile,
          notes: this.createRecordDraft.notes.trim(),
          campaignId: this.createRecordDraft.campaignId,
          campaignType: this.createRecordType
        });
        if (response.lead.campaignId === this.selectedCampaignId) {
          this.leads = [this.normalizeLead(response.lead), ...this.leads];
        }
        this.isCreateRecordModalOpen = false;
        this.actionMessage =
          (this.createRecordType === 'Members' ? 'Member' : 'Lead') +
          ' added successfully.';
      } catch (error) {
        this.authError =
          error instanceof Error ? error.message : 'Unable to add the record.';
      } finally {
        this.isCreateRecordSaving = false;
      }
    }
  };
}
