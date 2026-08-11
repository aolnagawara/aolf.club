import type { SevaWorkspaceContext, Lead, LeadSnapshot } from './types';
import type { UpdateLeadRequest } from '../../../shared/contracts/appContracts';
import {
  DEFAULT_CAMPAIGN_MESSAGE,
  DEFAULT_WHATSAPP_COUNTRY_CODE
} from '../../config/campaignDefaults';

export function createCommunicationMethods() {
  return {
    getTelHref(this: SevaWorkspaceContext, phone: string): string {
      const input = String(phone || '').trim();
      const hasPlus = input.startsWith('+');
      const digits = this.cleanPhone(input);
      if (!digits) {
        return 'tel:';
      }
      return 'tel:' + (hasPlus ? '+' : '') + digits;
    },
    dialLead(this: SevaWorkspaceContext, lead: Lead): void {
      const telHref = this.getTelHref(lead.mobile || lead.id);
      if (telHref === 'tel:') {
        return;
      }
      window.location.href = telHref;
    },
    buildCampaignMessage(this: SevaWorkspaceContext, lead: Lead): string {
      const leadCampaign = this.campaigns.find(
        (campaign) => campaign.id === lead.campaignId
      );
      const template =
        leadCampaign?.message ||
        this.campaignMessage ||
        this.appConfig.defaultCampaignMessage ||
        DEFAULT_CAMPAIGN_MESSAGE;
      const campaignName =
        leadCampaign?.name || this.selectedCampaign?.name || 'our center';
      return template
        .replaceAll('{name}', lead.name || 'Friend')
        .replaceAll('{campaign}', campaignName);
    },
    buildWhatsappHref(this: SevaWorkspaceContext, lead: Lead): string {
      const phone = this.cleanPhone(lead.mobile || lead.id || '');
      const countryCode =
        this.cleanPhone(
          String(
            this.appConfig.whatsappCountryCode || DEFAULT_WHATSAPP_COUNTRY_CODE
          )
        ) || DEFAULT_WHATSAPP_COUNTRY_CODE;
      const destination =
        phone.length > 10 && phone.startsWith(countryCode)
          ? phone
          : countryCode + phone;
      const message = encodeURIComponent(this.buildCampaignMessage(lead));
      return 'https://wa.me/' + destination + '?text=' + message;
    },
    async saveLead(
      this: SevaWorkspaceContext,
      lead: Lead,
      snapshot: LeadSnapshot = this.createLeadSnapshot(lead)
    ): Promise<string> {
      const payload: UpdateLeadRequest = {
        id: String(lead.id || ''),
        name: snapshot.name,
        status: snapshot.status,
        quality: snapshot.quality,
        followUp: snapshot.followUp,
        notes: snapshot.notes,
        campaignId: lead.campaignId,
        campaignType: lead.campaignType,
        wishlistPrograms: this.getProgramListForSave(snapshot.wishlistPrograms),
        donePrograms: this.getProgramListForSave(snapshot.donePrograms)
      };

      const response = await window.appRuntime.updateLead(payload);
      return response.lead.lastUpdated || 'Just now';
    }
  };
}
