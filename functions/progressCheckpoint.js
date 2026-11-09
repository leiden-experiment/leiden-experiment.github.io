'use strict';
function slidesForStudyWeek(weeks, week) {
  if (Object.prototype.hasOwnProperty.call(weeks, String(week))) return weeks[String(week)] || [];
  if (!Number.isInteger(week) || week < 1) return [];
  for (let previous = week - 1; previous >= 1; previous--) {
    if (Object.prototype.hasOwnProperty.call(weeks, String(previous))) return weeks[String(previous)] || [];
  }
  return [];
}
/** At a fresh participant login, resume from the most recently completed
 * playable step, not from text/camera screens clicked afterwards. Historical
 * results and fully completed sessions must never be rewound. */
function restoreProgressAtLevelCheckpoint(saved, weeks) {
  if (!saved || typeof saved !== 'object') return saved;
  const completed = { ...(saved.completed || {}) };
  let changed = false;
  for (const [week, sid] of Object.entries(saved.activeSession || {})) {
    const slides = slidesForStudyWeek(weeks, Number(week));
    if (!sid || !slides.length) continue;
    const done = completed[week] || [];
    if (!Array.isArray(done)) continue;
    const prefix = `${sid}:`;
    const completedIndexes = new Set(done.filter(value => typeof value === 'string' && value.startsWith(prefix))
      .map(value => Number(value.slice(prefix.length))).filter(Number.isInteger));
    const steps = slides;
    const lastPlay = steps.reduce((last, step, index) => completedIndexes.has(index) &&
      step && (!step.type || step.type === 'level' || step.type === 'selection') ? index : last, -1);
    const retained = done.filter(value => {
      if (typeof value !== 'string' || !value.startsWith(prefix)) return true;
      const index = Number(value.slice(prefix.length));
      return !Number.isInteger(index) || index <= lastPlay ||
        (steps[index] && (!steps[index].type || steps[index].type === 'level' || steps[index].type === 'selection'));
    });
    if (retained.length !== done.length) { completed[week] = retained; changed = true; }
  }
  return changed ? { ...saved, completed } : saved;
}
module.exports = { restoreProgressAtLevelCheckpoint };
