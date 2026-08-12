import type {
  SevaWorkspaceContext,
  Campaign,
  CampaignUiMeta,
  OptionItem
} from './types';
import { isApiClientError } from '../../services/apiClient';
import {
  getDefaultCampaignUiMeta,
  getDefaultQualityOptionsForCampaignType,
  getDefaultStatusOptionsForCampaignType
} from '../../config/campaignDefaults';

function toAuthErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) {
    if (error.code === 'FORBIDDEN') {
      return 'Your account is not authorized for this workspace. Please contact an admin.';
    }
    if (error.code === 'UNAUTHENTICATED') {
      return 'Your session has expired. Please sign in again.';
    }
    if (error.code === 'UPSTREAM_ERROR') {
      return 'Unable to reach Google Sheets right now. Please try again shortly.';
    }
    return error.message || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function captureCampaignView(context: SevaWorkspaceContext) {
  return {
    appConfig: context.appConfig,
    campaigns: context.campaigns,
    selectedCampaignId: context.selectedCampaignId,
    selectedCampaign: context.selectedCampaign,
    campaignType: context.campaignType,
    campaignMessage: context.campaignMessage,
    leads: context.leads,
    filterOptions: context.filterOptions,
    selectedFilter: context.selectedFilter,
    qualityOptions: context.qualityOptions,
    statusOptions: context.statusOptions,
    qualityMetaMap: context.qualityMetaMap,
    statusIconMap: context.statusIconMap,
    defaultStatusIcon: context.defaultStatusIcon,
    programOrderMap: context.programOrderMap,
    programCodeMap: context.programCodeMap,
    activeCardId: context.activeCardId,
    isProfileMenuOpen: context.isProfileMenuOpen,
    filteredCriteriaKey: context.filteredCriteriaKey,
    visibleLeadLimit: context.visibleLeadLimit,
    dueFollowUpCount: context.dueFollowUpCount,
    upcomingFollowUpCount: context.upcomingFollowUpCount
  };
}

function restoreCampaignView(
  context: SevaWorkspaceContext,
  snapshot: ReturnType<typeof captureCampaignView>
): void {
  Object.assign(context, snapshot);
}

export function createAuthAndBootstrapMethods() {
  return {
    async init(this: SevaWorkspaceContext): Promise<void> {
      this.globalPointerDownHandler = (event: PointerEvent) =>
        this.handleGlobalPointerDown(event);
      document.addEventListener(
        'pointerdown',
        this.globalPointerDownHandler,
        true
      );
      await this.initializeAuthenticatedSession();
    },
    async initializeAuthenticatedSession(
      this: SevaWorkspaceContext
    ): Promise<void> {
      this.authError = '';
      this.isLoadingBootstrap = true;
      try {
        const user = await window.appRuntime.getAuthenticatedUser();
        if (!user) {
          this.isVolunteerModalOpen = true;
          this.isLoadingBootstrap = false;
          return;
        }
        this.authenticatedUser = user;
        this.volunteerEmail = String(user.email || '')
          .trim()
          .toLowerCase();
        this.isVolunteerModalOpen = false;
        await this.loadBootstrap();
      } catch (error) {
        this.authError = toAuthErrorMessage(
          error,
          'Unable to verify session. Please try again.'
        );
        this.isVolunteerModalOpen = true;
        this.isLoadingBootstrap = false;
      }
    },
    async startAuthFlow(this: SevaWorkspaceContext): Promise<void> {
      this.authError = '';
      this.isLoadingBootstrap = true;
      try {
        const user = await window.appRuntime.signInWithGoogle();
        this.authenticatedUser = user;
        this.volunteerEmail = String(user.email || '')
          .trim()
          .toLowerCase();
        this.isVolunteerModalOpen = false;
        await this.loadBootstrap();
      } catch (error) {
        this.authError = toAuthErrorMessage(
          error,
          'Sign in failed. Please try again.'
        );
        this.isVolunteerModalOpen = true;
        this.isLoadingBootstrap = false;
      }
    },
    isValidVolunteerEmail(this: SevaWorkspaceContext, value: string): boolean {
      const email = String(value || '')
        .trim()
        .toLowerCase();
      return /.+@.+\..+/.test(email);
    },
    saveVolunteerEmail(this: SevaWorkspaceContext): void {
      this.isVolunteerModalOpen = true;
    },
    toggleProfileMenu(this: SevaWorkspaceContext): void {
      this.isProfileMenuOpen = !this.isProfileMenuOpen;
    },
    closeProfileMenu(this: SevaWorkspaceContext): void {
      this.isProfileMenuOpen = false;
    },
    getProfileName(this: SevaWorkspaceContext): string {
      const name = String(this.authenticatedUser?.name || '').trim();
      if (name) {
        return name;
      }
      const email = String(this.authenticatedUser?.email || '').trim();
      if (email) {
        return email;
      }
      return 'Guest User';
    },
    getProfileInitials(this: SevaWorkspaceContext): string {
      const source = this.getProfileName();
      const parts = source.split(/\s+/).filter(Boolean);
      if (!parts.length) {
        return 'GU';
      }
      if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
      }
      return (parts[0][0] + parts[1][0]).toUpperCase();
    },
    signOutToLanding(this: SevaWorkspaceContext): void {
      this.authenticatedUser = null;
      this.volunteerEmail = '';
      this.authError = '';
      this.isVolunteerModalOpen = true;
      this.isProfileMenuOpen = false;
      this.isFilterPanelOpen = false;
      this.isOptionSheetOpen = false;
      this.isFollowUpModalOpen = false;
      this.isProgramEditorOpen = false;
      this.leads = [];
      this.campaigns = [];
      this.selectedCampaign = null;
      this.selectedCampaignId = '';
      this.searchQuery = '';
      this.metricFilter = 'all';
      this.selectedFilter = 'all';
      this.programFilter = '';
      this.activeCardId = '';
      this.clearSelection();
    },
    async onCampaignChange(
      this: SevaWorkspaceContext,
      campaignId?: string
    ): Promise<void> {
      const targetCampaignId = campaignId || this.selectedCampaignId;
      if (!targetCampaignId || targetCampaignId === this.selectedCampaignId) {
        return;
      }

      this.isCampaignSwitching = true;
      try {
        const saved = await this.flushPendingSaves();
        if (!saved) {
          this.authError =
            'Some changes could not be saved. Please retry before switching Seva.';
          return;
        }
        await this.loadBootstrap(targetCampaignId);
      } finally {
        this.isCampaignSwitching = false;
      }
    },
    getSelectedCampaignName(this: SevaWorkspaceContext): string {
      if (this.selectedCampaign && this.selectedCampaign.name) {
        return this.selectedCampaign.name;
      }
      const firstCampaign = this.campaigns[0];
      return firstCampaign ? firstCampaign.name : 'Select Seva';
    },
    openCampaignSheet(this: SevaWorkspaceContext): void {
      if (this.isLoadingBootstrap) {
        return;
      }

      this.optionSheetMode = 'campaign';
      this.optionSheetTitle = 'Switch Seva';
      this.optionSheetOptions = this.campaigns.map(
        (campaign: Campaign): OptionItem => ({
          value: campaign.id,
          label: campaign.name,
          icon: campaign.type === 'Members' ? '👥' : '📞'
        })
      );
      this.currentOptionValue = this.selectedCampaignId;
      this.activeOptionLead = null;
      this.isOptionSheetOpen = true;
    },
    getCampaignUiMeta(this: SevaWorkspaceContext): CampaignUiMeta {
      const configured = this.appConfig.uiByType?.[this.campaignType];
      if (
        configured &&
        Array.isArray(configured.filterOptions) &&
        configured.filterOptions.length
      ) {
        return configured;
      }

      return getDefaultCampaignUiMeta(this.campaignType);
    },
    async loadBootstrap(
      this: SevaWorkspaceContext,
      campaignId?: string
    ): Promise<void> {
      if (!this.volunteerEmail) {
        this.isVolunteerModalOpen = true;
        this.isLoadingBootstrap = false;
        return;
      }

      const isCampaignSwitch = Boolean(
        campaignId &&
        this.selectedCampaignId &&
        campaignId !== this.selectedCampaignId
      );
      const previousCampaignView = isCampaignSwitch
        ? captureCampaignView(this)
        : null;

      this.isLoadingBootstrap = true;
      try {
        const response = await window.appRuntime.loadBootstrap(
          campaignId || this.selectedCampaignId || null
        );
        if (!response || !response.success) {
          throw new Error('Seva data could not be loaded.');
        }

        const responseConfig = response.config || {};
        const mergedConfig = { ...this.appConfig, ...responseConfig };
        const directPrograms = Array.isArray(mergedConfig.programs)
          ? mergedConfig.programs
          : [];
        const fallbackPrograms = this.buildProgramCatalogFromOrder(
          mergedConfig.programDisplayOrder || []
        );
        const defaultPrograms = this.defaultPrograms.map((item) => ({
          code: item.code,
          label: item.label
        }));

        if (
          mergedConfig.qualityMetaMap &&
          Object.keys(mergedConfig.qualityMetaMap).length > 0
        ) {
          this.qualityMetaMap = {
            ...this.qualityMetaMap,
            ...mergedConfig.qualityMetaMap
          };
        }
        if (
          mergedConfig.statusIconMap &&
          Object.keys(mergedConfig.statusIconMap).length > 0
        ) {
          this.statusIconMap = {
            ...this.statusIconMap,
            ...mergedConfig.statusIconMap
          };
        }
        if (
          typeof mergedConfig.defaultStatusIcon === 'string' &&
          mergedConfig.defaultStatusIcon
        ) {
          this.defaultStatusIcon = mergedConfig.defaultStatusIcon;
        }

        this.appConfig = {
          ...mergedConfig,
          programs: directPrograms.length
            ? directPrograms
            : fallbackPrograms.length
              ? fallbackPrograms
              : defaultPrograms
        };
        this.refreshProgramCaches();
        this.campaigns = this.appConfig.campaigns || [];
        this.selectedCampaignId =
          response.campaignId ||
          campaignId ||
          (this.campaigns[0] ? this.campaigns[0].id : '');
        this.selectedCampaign =
          this.campaigns.find((item) => item.id === this.selectedCampaignId) ||
          this.campaigns[0] ||
          null;
        this.campaignType = this.selectedCampaign
          ? this.selectedCampaign.type
          : 'Leads';
        this.campaignMessage = this.selectedCampaign
          ? this.selectedCampaign.message || ''
          : '';
        this.qualityOptions = getDefaultQualityOptionsForCampaignType(
          this.campaignType
        ).map((label: string): OptionItem => {
          return {
            value: label,
            label: label,
            icon: this.getQualityMeta(label).icon
          };
        });
        this.statusOptions = getDefaultStatusOptionsForCampaignType(
          this.campaignType
        );
        this.filterOptions = this.getCampaignUiMeta().filterOptions;
        this.selectedFilter = this.filterOptions[0]
          ? this.filterOptions[0].id
          : 'all';
        this.programFilter = '';
        this.leads = (response.leads || [])
          .map((lead: unknown) => this.normalizeLead(lead))
          .reverse();
        if (!this.appConfig.programs.length) {
          const inferredPrograms = this.inferProgramsFromLeads(this.leads);
          if (inferredPrograms.length) {
            this.appConfig.programs = inferredPrograms;
            if (
              !Array.isArray(this.appConfig.programDisplayOrder) ||
              !this.appConfig.programDisplayOrder.length
            ) {
              this.appConfig.programDisplayOrder = inferredPrograms.map(
                (item: { code: string }) => item.code
              );
            }
            this.refreshProgramCaches();
          }
        }
        this.activeCardId = '';
        this.clearSelection();
        this.isProfileMenuOpen = false;
        this.authError = '';
      } catch (error) {
        if (previousCampaignView) {
          restoreCampaignView(this, previousCampaignView);
        } else {
          this.leads = [];
        }
        this.authError = toAuthErrorMessage(
          error,
          'Unable to load Seva data. Please try again.'
        );
        if (
          isApiClientError(error) &&
          (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED')
        ) {
          this.isVolunteerModalOpen = true;
        }
      } finally {
        this.isLoadingBootstrap = false;
      }
    },
    getQualityFieldLabel(this: SevaWorkspaceContext): string {
      return this.campaignType === 'Members' ? 'Engagement' : 'Quality';
    }
  };
}
