const STUDENT_FAMILY_AUDIENCE = 'Студенческие семьи';

function normalize(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

const targetedPatterns = [
  /студенческ\p{L}*\s+сем/iu,
  /сем\p{L}*\s+студент/iu,
  /родител\p{L}*[-–—]\s*студент/iu,
  /студент\p{L}*[-–—]\s*родител/iu,
  /матер\p{L}*[-–—]\s*студент/iu,
  /студент\p{L}*.{0,24}\sс\s+детьми/iu,
  /студенток?\s+с\s+детьми/iu,
  /дет\p{L}*\s+студентов/iu,
  /дет\p{L}*.{0,25}чьи\s+родител\p{L}*.{0,20}(?:учат|обуча)/iu,
  /комнат\p{L}*\s+матери\s+и\s+ребенк\p{L}*.{0,40}студент/iu
];

const relatedPatterns = [
  /беременн\p{L}*.{0,28}студент/iu,
  /студент\p{L}*.{0,28}беременн/iu,
  /студентк\p{L}*.{0,35}(?:родив|рождени|родил|усынов)/iu,
  /(?:родив|рождени|родил|усынов).{0,35}студентк/iu
];

export function studentFamilyRelevance(measure) {
  const text = normalize([measure?.title, measure?.summary, measure?.benefit].filter(Boolean).join(' '));
  const title = normalize(measure?.title);
  if (/трудов\p{L}*\s+прав\p{L}*.{0,45}родител\p{L}*.{0,30}студент/iu.test(title)) return null;
  if (targetedPatterns.some((pattern) => pattern.test(text))) return 'targeted';
  if (measure?.id === 'sovetmam:posobie-po-beremennosti-i-rodam') return 'related';
  if (relatedPatterns.some((pattern) => pattern.test(title))) return 'related';
  return null;
}

export function annotateMeasureAudiences(measures) {
  return (Array.isArray(measures) ? measures : []).map((measure) => {
    const relevance = studentFamilyRelevance(measure);
    const existing = Array.isArray(measure?.audiences)
      ? measure.audiences.filter((value) => value && value !== STUDENT_FAMILY_AUDIENCE)
      : [];
    if (!relevance) {
      const next = { ...measure };
      if (existing.length) next.audiences = existing;
      else delete next.audiences;
      delete next.student_family_relevance;
      return next;
    }
    return {
      ...measure,
      audiences: [...existing, STUDENT_FAMILY_AUDIENCE],
      student_family_relevance: relevance
    };
  });
}

export { STUDENT_FAMILY_AUDIENCE };
