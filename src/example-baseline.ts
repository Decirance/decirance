// SPDX-License-Identifier: Apache-2.0
/**
 * A seeded Organisation Assurance Baseline for the reference case.
 *
 * Meridian Council is fictional and so is this policy. It exists to make one
 * thing visible that the product could not previously show: the difference
 * between what an organisation has decided in general and what a particular
 * deployment is allowed to do.
 *
 * Two rules are doing deliberate work in the demonstration.
 *
 * `ORG-004` denies autonomous external send. The Meridian contract prohibits it
 * too, so it shows a prohibition correctly inherited — the ordinary case, and
 * the one people forget to check.
 *
 * `ORG-007` requires a documented route to human review before any adverse
 * outcome. The reference contract does not record it, so it shows as
 * *unresolved* rather than violated: the engine can see the rule is not
 * satisfied and cannot conclude that it is breached. That distinction is the
 * point. Silence is not compliance, and it is also not a finding.
 */

import type { OrganisationAssuranceBaseline } from './baseline';

export const EXAMPLE_BASELINE: OrganisationAssuranceBaseline = {
  id: 'oab_meridian',
  organisationId: 'org:meridian-council',
  name: 'Meridian Council AI Assurance Baseline',
  schemaVersion: '0.1.0',
  revision: '2026.2',
  status: 'active',
  effectiveFrom: '2026-04-01',
  reviewDueAt: '2027-04-01',
  ownerUserId: 'Dr Ines Halvorsen, Security Assurance',
  approvedBy: 'Ari Rios, Director of Customer Operations',
  approvedAt: '2026-03-24',
  jurisdictions: ['GB-SCT', 'GB-EAW'],
  sectors: ['local government'],
  rules: [
    {
      ruleId: 'ORG-001',
      key: 'accountability.named_owner',
      category: 'accountability',
      statement: 'Every AI system in operation has a single named accountable owner at director level or above.',
      outcome: 'require',
      subject: 'named_accountable_owner',
      exceptable: false,
      requiredApprover: 'Director of Customer Operations',
      enforcementLocation: 'human_procedure',
      sourceRef: 'AI Governance Policy 2026, §3.1',
      reasonCode: 'ORG_OWNER_REQUIRED',
    },
    {
      ruleId: 'ORG-002',
      key: 'prohibited.eligibility_decision',
      category: 'prohibited_use',
      statement: 'No AI system may determine eligibility for a service or benefit without a human decision-maker.',
      outcome: 'deny',
      subject: 'eligibility:determine',
      exceptable: false,
      enforcementLocation: 'design',
      sourceRef: 'AI Governance Policy 2026, §2.4',
      reasonCode: 'ORG_ELIGIBILITY_PROHIBITED',
    },
    {
      ruleId: 'ORG-003',
      key: 'data.special_category',
      category: 'data_classification',
      statement: 'Special category personal data may not be sent to a model hosted outside the United Kingdom.',
      outcome: 'deny',
      subject: 'data:special_category_offshore',
      exceptable: false,
      enforcementLocation: 'gateway',
      sourceRef: 'Data Protection Standard, §7',
      reasonCode: 'ORG_SPECIAL_CATEGORY_RESIDENCY',
    },
    {
      ruleId: 'ORG-004',
      key: 'authority.autonomous_external_send',
      category: 'authority_limits',
      statement: 'No AI system may send communication outside the organisation without prior human approval.',
      outcome: 'deny',
      subject: 'external:send_autonomous',
      exceptable: true,
      requiredApprover: 'CISO and the accountable owner jointly',
      enforcementLocation: 'gateway',
      sourceRef: 'AI Governance Policy 2026, §4.2',
      reasonCode: 'ORG_NO_AUTONOMOUS_SEND',
    },
    {
      ruleId: 'ORG-005',
      key: 'oversight.review_before_durable_change',
      category: 'human_oversight',
      statement: 'A trained reviewer approves any change to durable customer records before it takes effect.',
      outcome: 'require',
      subject: 'human_review_before_durable_change',
      exceptable: false,
      evidenceObligation: 'Reviewer gate test against the deployed configuration.',
      enforcementLocation: 'runtime',
      sourceRef: 'AI Governance Policy 2026, §4.1',
      reasonCode: 'ORG_REVIEW_REQUIRED',
    },
    {
      ruleId: 'ORG-006',
      key: 'evidence.independent_for_critical',
      category: 'evidence',
      statement: 'Critical claims require evidence produced independently of the team that built the agent.',
      outcome: 'require_evidence',
      subject: 'independent_evidence_for_critical_claims',
      exceptable: true,
      evidenceObligation: 'Assessment by a party with no reporting line to the delivery team.',
      enforcementLocation: 'human_procedure',
      sourceRef: 'Assurance Standard, §5.2',
      reasonCode: 'ORG_INDEPENDENCE_REQUIRED',
    },
    {
      ruleId: 'ORG-007',
      key: 'rights.route_to_human_review',
      category: 'human_oversight',
      statement: 'Any person affected by an adverse outcome has a documented route to human review before it is finalised.',
      outcome: 'require',
      subject: 'affected_person_review_route',
      exceptable: false,
      evidenceObligation: 'The published route, and evidence it has been exercised at least once.',
      enforcementLocation: 'human_procedure',
      sourceRef: 'Public Sector Equality Duty assessment, §4',
      reasonCode: 'ORG_HUMAN_REVIEW_ROUTE',
    },
    {
      ruleId: 'ORG-008',
      key: 'permit.maximum_duration',
      category: 'permit_duration',
      statement: 'No deployment permit runs for longer than twelve months without reassessment.',
      outcome: 'restrict',
      subject: 'permit_duration_months',
      exceptable: true,
      requiredApprover: 'CISO',
      enforcementLocation: 'design',
      sourceRef: 'AI Governance Policy 2026, §6.1',
      reasonCode: 'ORG_PERMIT_MAX_DURATION',
    },
    {
      ruleId: 'ORG-009',
      key: 'incident.emergency_suspension',
      category: 'incident',
      statement: 'The duty security manager may suspend any AI system immediately, without prior consultation.',
      outcome: 'allow',
      subject: 'emergency_suspension',
      exceptable: false,
      enforcementLocation: 'human_procedure',
      sourceRef: 'Incident Response Plan, §9',
      reasonCode: 'ORG_EMERGENCY_SUSPENSION',
    },
    {
      ruleId: 'ORG-010',
      key: 'change.model_or_tool',
      category: 'material_change',
      statement: 'A change of model, tool, permission or data source requires reassessment before continued operation.',
      outcome: 'require',
      subject: 'reassessment_on_material_change',
      exceptable: false,
      enforcementLocation: 'ci',
      sourceRef: 'AI Governance Policy 2026, §6.3',
      reasonCode: 'ORG_REASSESS_ON_CHANGE',
    },
    {
      ruleId: 'ORG-011',
      key: 'procurement.supplier_disclosure',
      category: 'accountability',
      statement:
        'Suppliers must disclose subprocessors, model provenance and known limitations before an agent is assessed. '
        + 'Sufficiency of that disclosure is a matter of professional judgement.',
      outcome: 'require',
      // No mechanical predicate: whether a disclosure is adequate is not a
      // property this engine can evaluate, and pretending otherwise would be
      // the overclaim the product argues against.
      humanReviewOnly: true,
      exceptable: true,
      requiredApprover: 'Procurement and the accountable owner',
      enforcementLocation: 'human_procedure',
      sourceRef: 'Procurement Standard for AI, §3',
      reasonCode: 'ORG_SUPPLIER_DISCLOSURE',
    },
  ],
};

/**
 * The reference agent's contract, as policy containment sees it.
 *
 * `affected_person_review_route` is deliberately absent from the satisfied
 * set. The Meridian agent drafts replies and a human sends them, so nobody
 * wrote the route down — which is exactly how an organisational requirement
 * goes unmet without anybody deciding to breach it.
 */
export const EXAMPLE_CONTRACT_POLICY_VIEW = {
  ref: 'ctx_meridian_casework@3.2.0',
  permittedActions: ['case:read', 'document:read', 'draft:create', 'review:request'],
  prohibitedActions: [
    'external:send_autonomous',
    'eligibility:determine',
    'data:special_category_offshore',
  ],
  satisfiedRequirements: [
    'named_accountable_owner',
    'human_review_before_durable_change',
    'independent_evidence_for_critical_claims',
    'reassessment_on_material_change',
  ],
};
