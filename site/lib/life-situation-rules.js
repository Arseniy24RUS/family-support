// Explicit conditions transcribed from the catalogue. An unanswered fact stays
// unknown; mentioning a category in supporting documents never implies that
// every recipient must belong to that category. Geography is checked separately.

export const CATALOG_FACTS = Object.freeze([
  { id: 'child-under-6', label: 'Есть ребёнок младше шести лет', primary: false },
  { id: 'child-under-17', label: 'Есть ребёнок младше 17 лет', primary: false },
  { id: 'child-under-18', label: 'Ребёнку, для которого подбирается мера, ещё нет 18 лет', primary: false },
  { id: 'child-5-to-17', label: 'Ребёнку от 5 до 17 лет', primary: false },
  { id: 'child-7-to-17', label: 'Ребёнку от 7 до 17 лет', primary: false },
  { id: 'child-2-months-to-7', label: 'Ребёнку от двух месяцев до семи лет', primary: false },
  { id: 'two-plus-schoolchildren', label: 'В семье одновременно учатся в школе не менее двух детей', primary: false },
  { id: 'three-plus-schoolchildren', label: 'В семье одновременно учатся в школе не менее трёх детей', primary: false },
  { id: 'four-plus-schoolchildren', label: 'В семье одновременно учатся в школе не менее четырёх детей', primary: false },
  { id: 'five-plus-minor-children', label: 'В семье не менее пяти детей младше 18 лет', primary: false },
  { id: 'single-mother', label: 'Для обращения мать относится к льготной категории «одинокая мать»', primary: false },
  { id: 'first-child-born-in-mordovia-period', label: 'Первый ребёнок родился в период с 1 июля 2025 года по 1 июля 2026 года', primary: false },
  { id: 'second-child-born', label: 'В семье родился второй ребёнок', primary: false },
  { id: 'third-or-later-child-born-or-adopted', label: 'В семье родился или был усыновлён третий либо последующий ребёнок', primary: false },
  { id: 'child-adopted', label: 'В семье усыновили или удочерили ребёнка', primary: false },
  { id: 'phenylketonuria', label: 'У ребёнка подтверждена фенилкетонурия', primary: false },
  { id: 'parent-disabled', label: 'У одного или обоих родителей установлена инвалидность', primary: false },
  { id: 'self-care-degree-iii', label: 'В заключении МСЭ ребёнку установлена III степень ограничения способности к самообслуживанию', primary: false },
  { id: 'mo-disability-income-limit', label: 'Доход семьи не превышает установленный в Московской области порог для выплаты ребёнку-инвалиду с III степенью ограничения самообслуживания', primary: false },
  { id: 'medical-milk-indication', label: 'Есть заключение врача о необходимости специальных молочных продуктов для ребёнка', primary: false },
  { id: 'unable-to-attend-school', label: 'По медицинскому заключению ребёнок не может посещать школу', primary: false },
  { id: 'mordovia-honorary-mother-diploma', label: 'Мать награждена Почётным дипломом многодетной матери Республики Мордовия', primary: false },
  { id: 'documented-housing-need', label: 'Нуждаемость семьи в улучшении жилищных условий подтверждена документами', primary: false },
  { id: 'existing-mortgage', label: 'У семьи есть ипотечный жилищный кредит, в том числе рефинансированный', primary: false },
  { id: 'land-waiting-list', label: 'Семья стоит в очереди на бесплатный земельный участок', primary: false },
  { id: 'kindergarten-child', label: 'Есть ребёнок, который посещает или поступает в детский сад', primary: false },
  { id: 'kindergarten-fee', label: 'За присмотр и уход за ребёнком в детском саду начисляется родительская плата', primary: false },
  { id: 'school-day-camp', label: 'Ребёнок посещает или будет посещать пришкольный оздоровительный лагерь дневного пребывания', primary: false },
  { id: 'child-in-education', label: 'Ребёнок обучается в образовательной организации', primary: false },
  { id: 'vocational-worker-program', label: 'Студент учится по программе подготовки квалифицированных рабочих', primary: false },
  { id: 'full-time-paid-college', label: 'Ребёнок учится очно на платном отделении государственного колледжа республики', primary: false },
  { id: 'completed-paid-college-year', label: 'Оплаченный учебный год в колледже завершён, платёжные документы сохранены', primary: false },
  { id: 'full-time-budget-student', label: 'Студент учится очно за счёт бюджета', primary: false },
  { id: 'student-orphan', label: 'Сам студент относится к категории сирот или детей, оставшихся без попечения родителей', primary: false },
  { id: 'student-disabled', label: 'У самого студента установлена инвалидность', primary: false },
  { id: 'student-veteran', label: 'Сам студент имеет статус ветерана боевых действий', primary: false },
  { id: 'student-lost-parents-during-study', label: 'Студент потерял родителей во время обучения', primary: false },
  { id: 'receives-social-assistance', label: 'Семья уже получает государственную социальную помощь по нуждаемости', primary: false },
  { id: 'child-difficult-life-situation', label: 'Ребёнок находится в трудной жизненной ситуации, которую можно подтвердить документами', primary: false },
  { id: 'utilities-paid-no-court-debt', label: 'ЖКУ оплачиваются вовремя; нет непогашенной задолженности за последние три года, подтверждённой судом', primary: false },
  { id: 'high-utilities-income-share', label: 'Расходы семьи на жильё и ЖКУ превышают допустимую в регионе долю дохода', primary: false },
  { id: 'utilities-no-debt-or-repayment-agreement', label: 'Задолженности по ЖКУ нет либо заключено соглашение о её погашении', primary: false },
  { id: 'pregnancy-180-days', label: 'Срок беременности составляет не менее 180 дней', primary: false },
  { id: 'married-to-conscript', label: 'Беременная женщина состоит в зарегистрированном браке с военнослужащим по призыву', primary: false },
  { id: 'father-conscript', label: 'Отец ребёнка проходит военную службу по призыву', primary: false },
  { id: 'father-military-first-year-student', label: 'Отец ребёнка учится на первом курсе военного учебного заведения', primary: false },
  { id: 'baby-needs-rental-items', label: 'В семье есть малыш, для ухода за которым нужны предметы из пункта проката', primary: false },
  { id: 'income-up-to-20000', label: 'Среднедушевой доход семьи не превышает 20 000 рублей в месяц', primary: false },
  { id: 'parent-under-30-full-time-student', label: 'Родитель моложе 30 лет и учится очно', primary: false },
  { id: 'child-6-months-to-3-not-in-kindergarten', label: 'Ребёнку от шести месяцев до трёх лет, он не посещает детский сад', primary: false },
  { id: 'receives-monthly-child-benefit', label: 'На ребёнка уже назначено ежемесячное пособие', primary: false },
  { id: 'eligible-nonworking-caregiver', label: 'Ухаживающему от 18 до 65 лет, он не работает, не учится очно, не имеет инвалидности и не получает пенсию', primary: false },
  { id: 'caregiver-trained', label: 'Ухаживающий прошёл обучение навыкам ухода в краевом учреждении соцобслуживания', primary: false },
  { id: 'disabled-family-income-below-one-and-half-pm', label: 'Среднедушевой доход семьи ребёнка-инвалида ниже 1,5 прожиточного минимума', primary: false },
  { id: 'indigenous-small-numbered-north', label: 'Ребёнок относится к коренным малочисленным народам Севера (КМНС)', primary: false },
  { id: 'child-mental-disorder', label: 'У ребёнка установлено психическое расстройство', primary: false },
  { id: 'child-of-deceased-service-member', label: 'У ребёнка погиб родитель — сотрудник правоохранительных органов или военнослужащий', primary: false },
  { id: 'chernobyl-beneficiary', label: 'Заявитель имеет статус пострадавшего от чернобыльской катастрофы либо является совместно проживающим членом его семьи', primary: false },
  { id: 'employer-birth-program', label: 'У работодателя заявителя есть корпоративная выплата при рождении ребёнка, и заявитель относится к её получателям', primary: false },
  { id: 'employer-housing-program', label: 'Работодатель заявителя предоставляет жилищную поддержку, и заявитель соответствует условиям этой программы', primary: false },
  { id: 'rural-specialist-program', label: 'Заявитель соответствует условиям земской программы для специалиста, переехавшего работать в сельскую местность', primary: false },
  { id: 'scientist-housing-program', label: 'Заявитель — научный работник с учёной степенью и стажем от пяти лет; кандидат наук моложе 35 лет либо доктор наук моложе 40 лет', primary: false },
  { id: 'supported-housing-cooperative', label: 'Заявитель входит в предусмотренную программой категорию получателей ЖСК с государственной поддержкой', primary: false },
  { id: 'childcare-caregiver', label: 'Заявитель фактически ухаживает за ребёнком', primary: false },
  { id: 'childcare-leave-or-retained-benefit', label: 'Работающему заявителю оформлен отпуск по уходу за ребёнком либо пособие сохраняется после выхода из такого отпуска на работу', primary: false },
  { id: 'nonworking-without-unemployment-benefit', label: 'Заявитель не работает и не получает пособие по безработице', primary: false },
  { id: 'full-time-student-mother', label: 'Мать ребёнка учится по очной форме', primary: false },
  { id: 'entrepreneur-caregiver', label: 'Ухаживающий за ребёнком заявитель — индивидуальный предприниматель', primary: false },
  { id: 'student-achievements', label: 'У студента есть выдающиеся достижения в учёбе, науке или творчестве, необходимые для отбора на стипендию или грант', primary: false },
  { id: 'maternity-benefit-recipient', label: 'Пособие по беременности и родам запрашивает сама женщина в связи со своей беременностью или родами', primary: false },
  { id: 'eligible-liquidation-dismissal', label: 'Женщина уволена из-за ликвидации организации или прекращения деятельности ИП в течение 12 месяцев до признания её безработной', primary: false }
]);

export const CATALOG_REQUIREMENTS = Object.freeze({
  // Mordovia: summary fields in site/data/measures.json unless noted otherwise.
  'sovetmam:mord-001': 'first-child-born-in-mordovia-period',
  // details/10.json, documents: proof of housing need.
  'sovetmam:mord-002': 'documented-housing-need',
  // details/29.json also includes an existing/refinanced mortgage and older children.
  'sovetmam:mord-003': {
    all: ['existing-mortgage', { any: ['birth-event', 'child-adopted'] }]
  },
  'sovetmam:mord-004': 'kindergarten-fee',
  'sovetmam:mord-005': { all: ['child-under-3', 'medical-milk-indication'] },
  'sovetmam:mord-006': { all: ['three-plus-children', 'school-child'] },
  // details/17.json: count simultaneous school pupils, not all children.
  'sovetmam:mord-007': {
    any: [
      'four-plus-schoolchildren',
      { all: ['single-mother', 'three-plus-schoolchildren'] },
      { all: ['three-plus-schoolchildren', 'low-income'] },
      { all: ['single-mother', 'two-plus-schoolchildren', 'low-income'] }
    ]
  },
  // The summary lists alternative grounds. details/12.json distinguishes actual
  // social-assistance receipt from low income; parental disability is not a ground.
  'sovetmam:mord-008': {
    all: [
      'full-time-budget-student',
      { any: ['student-orphan', 'student-disabled', 'student-veteran', 'receives-social-assistance'] }
    ]
  },
  'sovetmam:mord-011': { all: ['child-disabled', 'phenylketonuria'] },
  'sovetmam:mord-012': { all: ['three-plus-children', 'mordovia-honorary-mother-diploma'] },
  // The two recipient categories are alternatives, not a requirement to have both.
  'sovetmam:mord-014': { any: ['low-income', 'three-plus-children'] },
  // details/14.json, notes: programmes for qualified workers.
  'sovetmam:mord-015': {
    all: [
      'college-student',
      'vocational-worker-program',
      { any: ['low-income', 'three-plus-children'] }
    ]
  },
  'sovetmam:mord-016': { all: ['three-plus-children', 'school-child'] },
  'sovetmam:mord-017': {
    all: ['svo-family', { any: ['school-child', 'college-student', 'child-in-education'] }]
  },
  'sovetmam:mord-018': { all: ['child-7-to-17', 'school-day-camp'] },
  'sovetmam:mord-019': { all: ['three-plus-children', 'child-2-months-to-7'] },
  'sovetmam:mord-020': { all: ['svo-family', 'kindergarten-child'] },
  // The category is absent from the summary; details/09.json requires its certificate.
  'sovetmam:mord-021': 'three-plus-children',
  'sovetmam:mord-022': 'three-plus-children',
  'sovetmam:mord-023': 'child-difficult-life-situation',
  'sovetmam:mord-024': 'child-5-to-17',
  'sovetmam:mord-025': 'svo-family',
  'sovetmam:mord-026': 'low-income',
  // details/21.json: judicially confirmed unpaid utility debts over the past 3 years.
  'sovetmam:zhku-mnogodetnym-mordovia': {
    all: ['three-plus-children', 'utilities-paid-no-court-debt']
  },

  // Federal records with alternative categories or misleading incidental mentions.
  // details/27.json: disability certificates apply only to the disability route;
  // ordinary children under 3 do not need large-family or disability status.
  'sovetmam:besplatnye-lekarstva-detyam': {
    any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }]
  },
  // details/21.json: medical conclusion is required for home schooling.
  'sovetmam:obuchenie-na-domu': {
    all: [
      'school-child',
      'unable-to-attend-school',
      { any: ['child-disabled', 'long-term-treatment'] }
    ]
  },
  'sovetmam:edv-invalidam': { any: ['child-disabled', 'adult-disabled'] },
  'sovetmam:edinovremennoe-pri-rozhdenii-rebenka': {
    any: ['birth-event', 'child-adopted']
  },
  'sovetmam:edinoe-posobie': {
    all: ['low-income', { any: ['pregnancy', 'child-under-17'] }]
  },
  // This overview covers several schemes; their special categories are not joint requirements.
  'sovetmam:lgoty-detskiy-sad': 'kindergarten-child',
  'sovetmam:stipendii-gosudarstvennye': 'full-time-budget-student',
  'sovetmam:kompensaciya-zhku-chernobyl': 'chernobyl-beneficiary',
  // details/01.json and details/11.json: these are voluntary employer programmes.
  'sovetmam:matkapital-ot-rabotodatelya': { all: ['birth-event', 'employer-birth-program'] },
  'sovetmam:pomoshch-s-zhilyem-ot-rabotodatelya': 'employer-housing-program',
  // details/05.json: rural programmes, the young-scientist certificate and supported
  // housing cooperatives are separate routes. Rural residence is not universal.
  'sovetmam:zhilishchnye-programmy-specialistov': {
    any: ['rural-specialist-program', 'scientist-housing-program', 'supported-housing-cooperative']
  },
  // details/28.json explicitly includes non-working parents and full-time students,
  // and preserves the benefit after return to work. Do not require current leave of everyone.
  'sovetmam:posobie-po-uhodu-do-1-5-let': {
    all: [
      'child-under-1-5',
      'childcare-caregiver',
      { any: [
        { all: ['working-parent', 'childcare-leave-or-retained-benefit'] },
        'nonworking-without-unemployment-benefit',
        'full-time-student-mother',
        'entrepreneur-caregiver'
      ] }
    ]
  },
  'sovetmam:stipendii-prezidentskie-imennye': {
    all: [{ any: ['college-student', 'university-student', 'full-time-budget-student'] }, 'student-achievements']
  },
  // details/06.json adds women dismissed following liquidation to the working/student routes.
  'sovetmam:posobie-po-beremennosti-i-rodam': {
    all: ['maternity-benefit-recipient', { any: ['working-parent', 'full-time-student-mother', 'eligible-liquidation-dismissal'] }]
  },
  'sovetmam:posobie-beremennoy-zhene-prizyvnika': {
    all: ['conscript-family', 'pregnancy-180-days', 'married-to-conscript']
  },
  // details/10.json, notes: the child must be under 3; the summary also lists first-year cadets.
  'sovetmam:posobie-na-rebenka-voennosluzhashego-po-prizyvu': {
    all: ['child-under-3', { any: ['father-conscript', 'father-military-first-year-student'] }]
  },
  // details/19.json: the general subsidy depends on the utility-cost share.
  // Low income changes the calculation; SVO and large-family status are not mandatory.
  'sovetmam:subsidiya-zhku-maloimushchim-svo': {
    all: ['high-utilities-income-share', 'utilities-no-debt-or-repayment-agreement']
  },

  // Other regions: these rules use the same fact vocabulary and evaluator.
  // The under-3 route is universal within these records. Large-family status is
  // needed only for the extended under-6 route, not for both age groups.
  'sovetmam:vol-031': { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] },
  'sovetmam:kostroma-012': { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] },
  'sovetmam:psk-001': { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] },
  'sovetmam:hak-008': { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] },
  'sovetmam:sve-019': { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] },
  'sovetmam:tamb-005': { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] },
  'sovetmam:tver-029': { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] },
  'sovetmam:khab-008': { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] },
  'sovetmam:tyumen-007': {
    all: ['low-income', { any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }] }]
  },
  'sovetmam:yamal-007': {
    any: [
      'child-under-3',
      { all: ['child-under-6', { any: ['three-plus-children', 'indigenous-small-numbered-north'] }] },
      { all: ['child-under-18', 'child-mental-disorder'] },
      'svo-family'
    ]
  },
  'sovetmam:yarosl-003': {
    any: ['child-under-3', { all: ['child-under-6', 'three-plus-children'] }, 'child-of-deceased-service-member']
  },
  // details/25.json also lists orphans and students who lost parents while studying.
  'sovetmam:kbr-013': {
    all: [
      'college-student',
      'full-time-paid-college',
      'completed-paid-college-year',
      { any: ['three-plus-children', 'child-disabled', 'student-orphan', 'student-lost-parents-during-study'] }
    ]
  },
  'sovetmam:rtadd-007': {
    all: ['baby-needs-rental-items', { any: ['three-plus-children', 'single-parent', 'student-family'] }]
  },
  'sovetmam:tat-006': {
    all: ['five-plus-minor-children', 'low-income', { any: ['parent-disabled', 'child-disabled'] }]
  },
  // details/06.json: documented housing need. Municipal residence is checked separately.
  'sovetmam:rtadd-001': {
    all: ['three-plus-children', 'land-waiting-list', 'documented-housing-need']
  },
  'sovetmam:tat-007': { all: ['child-under-3', 'low-income'] },
  // Large-family status increases the compensation; it is not required for the base route.
  'sovetmam:rtadd-009': { all: ['kindergarten-fee', 'income-up-to-20000'] },
  'sovetmam:rtadd-008': 'kindergarten-fee',
  // details/31.json, documents: full-time study and an already assigned monthly benefit.
  'sovetmam:rtadd-006': {
    all: ['parent-under-30-full-time-student', 'child-6-months-to-3-not-in-kindergarten', 'receives-monthly-child-benefit']
  },
  'sovetmam:msk-detsad-mnogodetnym-besplatno': {
    all: ['three-plus-children', 'kindergarten-child']
  },
  'sovetmam:msk-svo-detsad-pitanie': {
    all: ['svo-family', { any: ['kindergarten-child', 'school-child'] }]
  },
  // details/02.json: five or more minor children, not just three children.
  'sovetmam:msk-mnogodetnym-tovary': 'five-plus-minor-children',
  'sovetmam:msk-svo-kruzhki-sekcii': { all: ['svo-family', 'school-child'] },
  'sovetmam:moadd-003': {
    all: ['child-disabled', 'child-under-18', 'self-care-degree-iii', 'mo-disability-income-limit']
  },
  // Regional maternity capital is not uniformly restricted to large families.
  'sovetmam:prim-003': 'second-child-born',
  'sovetmam:prim-004': 'third-or-later-child-born-or-adopted',
  // details/10.json: caregiver qualifications and income below 1.5 subsistence minima.
  'sovetmam:prim-017': {
    all: ['child-disabled', 'eligible-nonworking-caregiver', 'caregiver-trained', 'disabled-family-income-below-one-and-half-pm']
  }
});
