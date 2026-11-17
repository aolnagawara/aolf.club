import { normalizeIndianMobile } from '../../../shared/contracts/indianMobile';
import { DEFAULT_QUALITY_META_MAP } from '../../config/campaignDefaults';
import type { Lead, LeadQueueView, SevaWorkspaceContext } from './types';

const TABLE_QUALITY_ICONS: Record<string, string> = {
  Hot: '🔥',
  Warm: '☀️',
  Cold: '❄️',
  Active: '⚡',
  Occasional: '🕒',
  Inactive: '⏸️',
  Shifted: '↪️'
};

function viewStorageKey(email: string): string {
  return 'aolf.leadQueueView.' + email.trim().toLowerCase();
}

export function createTableViewMethods() {
  return {
    restoreLeadQueueView(this: SevaWorkspaceContext): void {
      this.leadQueueView = 'cards';
      try {
        if (
          window.localStorage?.getItem(viewStorageKey(this.volunteerEmail)) ===
          'table'
        ) {
          this.leadQueueView = 'table';
        }
      } catch {
        // The queue is usable without browser storage.
      }
    },
    async selectLeadQueueView(
      this: SevaWorkspaceContext,
      view: LeadQueueView
    ): Promise<void> {
      if (view === this.leadQueueView || !(await this.flushPendingSaves()))
        return;
      this.leadQueueView = view;
      this.cancelCardLongPress();
      try {
        window.localStorage?.setItem(viewStorageKey(this.volunteerEmail), view);
      } catch {
        // Keep the current preference for this session.
      }
    },
    getTableQualityIcon(this: SevaWorkspaceContext, quality: string): string {
      if (!quality.trim() || quality === this.getQualityFieldLabel())
        return '—';
      const icon = this.getQualityMeta(quality).icon;
      return icon === DEFAULT_QUALITY_META_MAP[quality]?.icon
        ? TABLE_QUALITY_ICONS[quality] || icon
        : icon;
    },
    getTableFollowUpState(
      this: SevaWorkspaceContext,
      lead: Lead
    ): 'none' | 'due' | 'upcoming' {
      if (lead._followUpTs === null) return 'none';
      return lead._followUpTs <= this.getTodayDateOnlyTimestamp()
        ? 'due'
        : 'upcoming';
    },
    openLeadEdit(
      this: SevaWorkspaceContext,
      lead: Lead,
      trigger: HTMLElement
    ): void {
      this.tableSheetTrigger = trigger;
      this.tableEditError = '';
      // Pickers edit this detached copy, so Cancel can discard the whole form.
      this.tableEditDraft = { ...lead, ...this.createLeadSnapshot(lead) };
      this.$nextTick?.(() => this.$refs?.tableEditSheet?.focus());
    },
    closeLeadEdit(this: SevaWorkspaceContext): void {
      if (!this.tableEditDraft || this.isTableEditSaving) return;
      this.tableEditDraft = null;
      this.tableEditError = '';
      this.restoreTableSheetFocus();
    },
    restoreTableSheetFocus(this: SevaWorkspaceContext): void {
      const trigger = this.tableSheetTrigger;
      this.tableSheetTrigger = null;
      this.$nextTick?.(() => {
        if (trigger?.isConnected && trigger.getClientRects().length)
          trigger.focus();
        else this.$refs?.queueViewButton?.focus();
      });
    },
    async saveTableLeadEdit(this: SevaWorkspaceContext): Promise<void> {
      const draft = this.tableEditDraft;
      if (!draft || this.isTableEditSaving) return;
      const lead = this.getLeadByKey(draft.id) as Lead | null;
      if (!lead) {
        this.tableEditError = 'This record is no longer in the queue.';
        return;
      }
      const name = draft.name.trim();
      if (!name) {
        this.tableEditError = 'Enter a name before saving.';
        this.$refs?.tableEditName?.focus();
        return;
      }

      if (draft.mobile !== lead.mobile) {
        const mobile = normalizeIndianMobile(draft.mobile);
        if (!mobile) {
          this.tableEditError = 'Enter a valid 10-digit Indian mobile number.';
          this.$refs?.tableEditMobile?.focus();
          return;
        }
        draft.mobile = mobile;
      }

      this.tableEditError = '';
      this.authError = '';
      this.isTableEditSaving = true;
      draft.name = name;
      try {
        const saved = await this.commitLeadDraft(lead, draft);
        if (!saved) {
          this.tableEditError =
            this.authError || 'Unable to save your changes. Please try again.';
          this.authError = '';
          return;
        }
      } finally {
        this.isTableEditSaving = false;
      }
      this.closeLeadEdit();
    },
    discardTableLeadChanges(this: SevaWorkspaceContext): void {
      const draft = this.tableEditDraft;
      if (!draft || this.isTableEditSaving) return;
      this.discardLeadChanges(this.getLeadByKey(draft.id));
      this.closeLeadEdit();
    }
  };
}
