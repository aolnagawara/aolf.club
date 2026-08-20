import type { SevaWorkspaceContext, Lead, LeadSnapshot } from './types';
import type {
  Course,
  UpdateLeadRequest
} from '../../../shared/contracts/appContracts';
import {
  DEFAULT_CAMPAIGN_MESSAGE,
  DEFAULT_WHATSAPP_COUNTRY_CODE
} from '../../config/campaignDefaults';
import {
  DEFAULT_COURSE_WHATSAPP_TEMPLATE,
  formatCourseMonthLabel,
  publicCoursePath
} from '../../../shared/contracts/courseDefaults.mjs';
import {
  ensureCourseUrlInMessage,
  fillCourseWhatsappTemplate
} from '../../../shared/contracts/courseMatching';

export function createCommunicationMethods() {
  return {
    getTelHref(this: SevaWorkspaceContext, phone: string): string {
      const input = String(phone || '').trim();
      const hasPlus = input.startsWith('+');
      const digits = this.cleanPhone(input);
      if (!digits) {
        return '';
      }
      return 'tel:' + (hasPlus ? '+' : '') + digits;
    },
    dialLead(this: SevaWorkspaceContext, lead: Lead): void {
      const telHref = this.getTelHref(lead.mobile);
      if (!telHref) {
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
    getWhatsappDestination(this: SevaWorkspaceContext, lead: Lead): string {
      const mobile = String(lead.mobile || '').trim();
      const phone = this.cleanPhone(mobile);
      if (!phone) {
        return '';
      }
      const countryCode =
        this.cleanPhone(
          String(
            this.appConfig.whatsappCountryCode || DEFAULT_WHATSAPP_COUNTRY_CODE
          )
        ) || DEFAULT_WHATSAPP_COUNTRY_CODE;
      return mobile.startsWith('+') ||
        (phone.length > 10 && phone.startsWith(countryCode))
        ? phone
        : countryCode + phone;
    },
    canOpenWhatsapp(this: SevaWorkspaceContext, lead: Lead): boolean {
      return Boolean(this.getWhatsappDestination(lead));
    },
    buildWhatsappHref(
      this: SevaWorkspaceContext,
      lead: Lead,
      course?: Course | null
    ): string {
      const destination = this.getWhatsappDestination(lead);
      if (!destination) {
        return '';
      }
      let message = this.buildCampaignMessage(lead);
      if (course) {
        const courseUrl =
          String(window.location.origin || '').replace(/\/$/, '') +
          (course.publicPath ||
            publicCoursePath(course.courseType, course.month) ||
            '/course/' + course.id);
        message = ensureCourseUrlInMessage(
          fillCourseWhatsappTemplate(
            course.whatsappTemplate || DEFAULT_COURSE_WHATSAPP_TEMPLATE,
            {
              name: lead.name || 'Friend',
              course: course.title || '',
              dates: formatCourseMonthLabel(course.month || ''),
              registrationLink: '',
              courseUrl
            }
          ),
          courseUrl
        );
      }
      return (
        'https://wa.me/' + destination + '?text=' + encodeURIComponent(message)
      );
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
