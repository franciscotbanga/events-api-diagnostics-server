// What this file does:
// Pure aggregation logic for batch event audits. Takes an array of events,
// runs each through the diagnostic engine, then rolls up the findings into
// the kind of summary report you'd send to an advertiser:
//   "I looked at your last N events. X% are missing currency. Here's the
//    ranked list of fixes by impact."

const { diagnose, getInfoForIssueLabel } = require('./diagnose');

const SEVERITY_RANK = { low: 0, medium: 1, high: 2 };

function audit(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      ok: false,
      error: 'Provide a non-empty array of events as { events: [...] }',
    };
  }

  const total = events.length;
  const bySeverity = { low: 0, medium: 0, high: 0 };
  const issueCounts = new Map();      // issue label → count
  const issueSeverity = new Map();    // issue label → highest severity seen
  const issueExamples = new Map();    // issue label → up to 3 example events
  const issueFix = new Map();         // issue label → developer_fix string
  const issueExplain = new Map();     // issue label → client_explanation string

  for (const event of events) {
    const result = diagnose(event);
    bySeverity[result.severity] = (bySeverity[result.severity] ?? 0) + 1;

    if (result.ok) continue;

    // We treat each "missing field" as a separate issue label, and the
    // overall summary string as the issue label for malformed cases.
    // This keeps the audit grouping intuitive: "missing currency" is its
    // own row, not lumped with "missing event_id".
    const labels = parseSummaryLabels(result.summary);

    for (const label of labels) {
      issueCounts.set(label, (issueCounts.get(label) ?? 0) + 1);

      const prev = issueSeverity.get(label);
      if (!prev || SEVERITY_RANK[result.severity] > SEVERITY_RANK[prev]) {
        issueSeverity.set(label, result.severity);
      }

      // Capture up to 3 example events per issue, redacted to the fields
      // that matter (so the audit report doesn't dump the whole payload).
      const examples = issueExamples.get(label) ?? [];
      if (examples.length < 3) {
        examples.push({
          event_id: event.event_id ?? null,
          event_name: event.event_name ?? null,
        });
        issueExamples.set(label, examples);
      }

      // Pull per-issue copy directly from the diagnose lookup tables.
      // We can't use result.developer_fix / result.client_explanation because
      // diagnose() concatenates all issues for multi-issue events, which would
      // give us the wrong copy for the per-issue audit row.
      if (!issueFix.has(label)) {
        const eventType = event?.event_name === 'Lead' ? 'Lead' : 'Purchase';
        const info = getInfoForIssueLabel(label, eventType);
        if (info) {
          issueFix.set(label, info.developer_fix);
          issueExplain.set(label, info.client_explanation);
        }
      }
    }
  }

  // Convert the Map data into the response shape, sorted by impact.
  // Impact = severity * count. High-severity-affecting-many = top of list.
  const topIssues = [...issueCounts.entries()]
    .map(([label, count]) => ({
      issue: label,
      count,
      rate: +(count / total).toFixed(3),
      severity: issueSeverity.get(label),
      developer_fix: issueFix.get(label),
      client_explanation: issueExplain.get(label),
      example_event_ids: issueExamples.get(label),
    }))
    .sort((a, b) => {
      const impactA = SEVERITY_RANK[a.severity] * 1000 + a.count;
      const impactB = SEVERITY_RANK[b.severity] * 1000 + b.count;
      return impactB - impactA;
    });

  const okCount = bySeverity.low;
  const failedCount = total - okCount;

  return {
    ok: true,
    total,
    valid: okCount,
    failed: failedCount,
    by_severity: bySeverity,
    top_issues: topIssues,
    summary_en: buildSummaryEn(total, failedCount, topIssues),
    summary_pt: buildSummaryPt(total, failedCount, topIssues),
  };
}

// Parse our summary string back into per-issue labels.
// Examples we expect:
//   "Purchase event is missing currency."           → ["missing currency"]
//   "Purchase event is missing event_id."           → ["missing event_id"]
//   "Purchase event has 2 issues: missing currency, missing content_ids."
//                                                   → ["missing currency", "missing content_ids"]
//   "Purchase event has an invalid field: value."   → ["invalid value"]
function parseSummaryLabels(summary) {
  if (!summary) return ['unknown'];
  const multiMatch = summary.match(/has \d+ issues?: (.+)\./);
  if (multiMatch) {
    return multiMatch[1].split(',').map((s) => s.trim());
  }
  const missingMatch = summary.match(/is missing (\S+?)\./);
  if (missingMatch) return [`missing ${missingMatch[1]}`];
  const invalidMatch = summary.match(/has an invalid field: (\S+?)\./);
  if (invalidMatch) return [`invalid ${invalidMatch[1]}`];
  return [summary];
}

function buildSummaryEn(total, failed, topIssues) {
  if (failed === 0) {
    return `All ${total} events are valid. No fixes required.`;
  }
  const top = topIssues[0];
  return `Audited ${total} events: ${failed} (${Math.round((failed / total) * 100)}%) have issues. Top issue: "${top.issue}" affects ${top.count} events (severity: ${top.severity}). Recommended first fix: ${top.developer_fix}`;
}

function buildSummaryPt(total, failed, topIssues) {
  if (failed === 0) {
    return `Todos os ${total} eventos estão válidos. Nenhuma correção necessária.`;
  }
  const top = topIssues[0];
  const sevPt = { low: 'baixa', medium: 'média', high: 'alta' }[top.severity];
  return `Auditoria de ${total} eventos: ${failed} (${Math.round((failed / total) * 100)}%) com problemas. Principal problema: "${top.issue}" afeta ${top.count} eventos (severidade: ${sevPt}). Primeira correção recomendada: ${top.developer_fix}`;
}

module.exports = { audit };
