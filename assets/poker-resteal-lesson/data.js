(function () {
  "use strict";
  const presets = [
    { id: "standard", label: "Обычный активный", stack: 40, openSize: 2, ante: 1, openPct: 50, callPct: 12, threshold: 0.5 },
    { id: "worst", label: "Худший сценарий", stack: 40, openSize: 2, ante: 1, openPct: 40, callPct: 18, threshold: 0 },
    { id: "bold", label: "Очень активный", stack: 40, openSize: 2.5, ante: 1, openPct: 65, callPct: 17, threshold: 0.5 },
    { id: "station", label: "Любит коллировать", stack: 40, openSize: 2, ante: 1, openPct: 55, callPct: 22, threshold: 0.5 }
  ];

  function seats(heroPosition, effectiveStack = 30) {
    return ["UTG", "HJ", "CO", "BTN", "SB", "BB"].map((label) => ({
      label,
      state: label === heroPosition ? "hero" : /SB|BB/.test(label) ? "blind" : "waiting",
      stackBb: effectiveStack
    }));
  }

  function spot({ id, title, question, hand, cards, heroPosition = "BB", stack = 30, openPosition = "BTN", openSize = 2.2, pot = null, history, profile, recent, correct, feedback, answer, cue, lesson, extraActions = [], smallRaiseSize = null }) {
    const preflopOrder = ["UTG", "HJ", "CO", "BTN"];
    const openerIndex = preflopOrder.indexOf(openPosition);
    const actionLine = [
      ...preflopOrder.slice(0, Math.max(0, openerIndex)).map((position) => `${position} fold`),
      `${openPosition} open ${openSize} BB`,
      ...preflopOrder.slice(openerIndex + 1).map((position) => `${position} fold`),
      ...(heroPosition !== "SB" ? ["SB fold"] : []),
      ...extraActions
    ];
    const toCall = Math.max(0, openSize - (heroPosition === "BB" ? 1 : 0.5));
    const toCallLabel = String(Math.round(toCall * 10) / 10).replace(".", ",");
    return {
      id, title, question, hand, profile, recent, answer, cue, lesson,
      table: {
        seats: seats(heroPosition, stack),
        heroPosition,
        heroStack: `${stack} BB`,
        effectiveStack: `${stack} BB`,
        pot: `${pot == null ? Math.round((openSize + 2.5) * 10) / 10 : pot} BB`,
        anteBb: 1,
        heroCards: cards,
        boardCards: [],
        street: "preflop",
        actionLine,
        historyLine: history,
        toCall,
        currentBet: openSize,
        dealerPosition: "BTN"
      },
      options: [
        { key: "fold", label: "Пас", correct: correct === "fold", feedback: feedback.fold },
        { key: "call", label: `Колл +${toCallLabel} BB`, correct: correct === "call", feedback: feedback.call },
        ...(smallRaiseSize ? [{ key: "raise8", label: `3-бет до ${smallRaiseSize} BB`, correct: correct === "raise8", feedback: feedback.raise8 }] : []),
        { key: "jam", label: `Олл-ин до ${stack} BB`, correct: correct === "jam", feedback: feedback.jam }
      ]
    };
  }

  const firstSpot = spot({
    id: "intro-qjo-vs-btn", title: "Первая раздача", hand: "QJo", cards: ["Qh", "Jd"], stack: 30, openSize: 2, smallRaiseSize: 8,
    question: "Все выбросили до BTN. Он открыл 2 BB, ты на BB с QJo. Что нажмёшь?",
    history: "Учебный спот · активный BTN против BB",
    profile: { label: "Активный рег", openPct: 50, foldPct: 80, sample: 158081 },
    recent: ["fold", "open", "open", "fold", "open"], correct: "jam",
    feedback: {
      fold: "Пас безопасен, но ты отдаёшь большой блайнд и банк 4,5 BB без борьбы.",
      call: "После колла QJo часто не попадает во флоп и остаётся без позиции.",
      raise8: "Небольшой 3-бет оставляет BTN возможность коллировать в позиции или поставить 4-бет. В этом учебном споте олл-ин сразу реализует давление и не создаёт сложный банк без позиции.",
      jam: "Да. Дама и валет убирают часть сильных рук BTN, а при колле QJo всё ещё может выиграть олл-ин."
    },
    lesson: "Это и есть рестил: олл-ин в ответ на позднее открытие, чтобы забрать уже собранный банк."
  });

  const practiceSpots = [
    spot({ id: "practice-55-reg", title: "Спот 1 · Маленькая пара", hand: "55", cards: ["5s", "5d"], stack: 30,
      question: "Активный BTN открыл 2,2 BB. Ты на BB с 55.", history: "BTN открывал 3 из последних 5 кругов",
      profile: { label: "Хороший рег", openPct: 51, foldPct: 80, sample: 158081 }, recent: ["open", "fold", "open", "open", "fold"], correct: "jam",
      feedback: { fold: "Слишком тайтово: 55 слишком сильны, чтобы отдавать BB широкому опену.", call: "Колл допустим, но почти любой флоп с высокими картами станет сложным без позиции.", jam: "Верно: BTN открывает широко и часто пасует, а 55 сохраняют нормальные шансы при колле." },
      answer: "Базовая линия — олл-ин. Здесь совпали три фактора: широкий BTN, около 80 пасов на 100 олл-инов и пара, которой трудно реализовать силу простым коллом.",
      cue: "Кандидат на олл-ин: готовая пара плюс много пасов BTN.",
      lesson: "Маленькие пары — хорошие кандидаты: при колле у них всегда есть готовая пара." }),
    spot({ id: "practice-a5s-station", title: "Спот 2 · Колл против станции", hand: "A5s", cards: ["Ah", "5h"], stack: 40, openSize: 2,
      question: "BTN редко пасует на олл-ин. Ты на BB с A5s против опена 2 BB.", history: "BTN продолжил против давления в 5 из 10 случаев",
      profile: { label: "Любит коллировать", openPct: 11, foldPct: 50, sample: 2957 }, recent: ["fold", "open", "fold", "open", "fold"], correct: "call",
      feedback: { fold: "Слишком тайтово: A5s далеко от нижней границы защиты BB и хорошо играет коллом.", call: "Верно: дешёвый колл сохраняет одномастность и туза, не рискуя 40 BB против частых продолжений.", jam: "Слишком много риска: соперник пасует лишь примерно в половине случаев, поэтому олл-ин теряет главный источник прибыли." },
      answer: "Базовая линия — колл. Нужно добавить 1 BB в банк 4,5 BB; A5s имеет достаточно силы и хорошо разыгрывается после флопа. Низкий fold-to-jam ухудшает олл-ин, но не превращает руку в пас.",
      cue: "Убери лишний риск: сильная защита коллом, мало фолд-эквити для пуша.",
      lesson: "Против игрока, который часто коллирует, хорошие постфлоп-руки чаще оставляем в колле." }),
    spot({ id: "practice-k8s-sb", title: "Спот 3 · Рестил с малого блайнда", hand: "K8s", cards: ["Kh", "8h"], heroPosition: "SB", stack: 30, openSize: 2.5,
      question: "Очень активный BTN открыл 2,5 BB. Ты на SB с K8s, за тобой ещё BB.", history: "Четыре открытия BTN за пять возможностей",
      profile: { label: "Очень активный", openPct: 65, foldPct: 80, sample: 0 }, recent: ["open", "open", "fold", "open", "open"], correct: "jam",
      feedback: { fold: "Слишком тайтово против BTN, который открывает почти всё подряд.", call: "Колл с SB неудобен: ты без позиции, а BB ещё может войти в банк.", jam: "Верно: широкий опен часто сдаётся, а король убирает часть сильных продолжений." },
      answer: "Базовая линия — олл-ин. На SB нет скидки большого блайнда, колл приглашает BB в банк, зато K8s блокирует часть сильных королей и использует высокий шанс паса BTN.",
      cue: "Другая позиция: на SB колл хуже, чем на BB.",
      lesson: "Один король в твоей руке уменьшает шанс, что у соперника сильный Kx или KK. Это называется блокером." }),
    spot({ id: "practice-a2o-nit", title: "Спот 4 · Нит не отменяет защиту", hand: "A2o", cards: ["As", "2d"], stack: 40, openSize: 2,
      question: "Редко открывающий BTN поставил 2 BB. Ты на BB с A2o.", history: "Только одно открытие BTN за последние пять возможностей",
      profile: { label: "Редко открывает", openPct: 34, foldPct: 78, sample: 2021 }, recent: ["fold", "fold", "open", "fold", "fold"], correct: "call",
      feedback: { fold: "Слишком большой оверфолд: A2o далеко от самого низа диапазона защиты BB.", call: "Верно: цена всего 1 BB, а туз даёт достаточно силы для базовой защиты.", jam: "Олл-ин может появляться как эксплойт против очень частых пасов, но редкий опен сильнее и чаще доминирует слабый туз." },
      answer: "Базовая линия — колл. Против нита можно выбросить чуть больше пограничных рук, но A2o не находится рядом с этой границей. Редкий опен прежде всего убирает автоматический пуш, а не превращает сильную защиту в пас.",
      cue: "Оверфолдим низ диапазона, но A2o — не низ.",
      lesson: "Смотри не только на процент паса после олл-ина, но и на то, насколько сильны руки первоначального открытия." }),
    spot({ id: "practice-77-utg", title: "Спот 5 · Сильный ранний опен", hand: "77", cards: ["7s", "7d"], stack: 30, openPosition: "UTG", openSize: 2,
      question: "UTG открыл 2 BB. Ты на BB с 77 и стеком 30 BB.", history: "Рейз пришёл из ранней позиции UTG",
      profile: { label: "Ранняя позиция", openPct: 18, foldPct: 55, sample: 0 }, recent: ["fold", "fold", "open", "fold", "fold"], correct: "call",
      feedback: { fold: "Слишком тайтово: 77 слишком сильны, чтобы выбрасывать на минрейз даже против UTG.", call: "Верно: сохраняем сильную руку в банке, но не раздуваем его против узкого диапазона.", jam: "Слишком прямолинейно: UTG начинает с сильных рук и заметно реже выбрасывает на 30 BB." },
      answer: "Базовая линия — колл. Сила UTG делает олл-ин хуже, но 77 всё ещё намного выше границы паса. Это важное различие: «не пуш» не означает «фолд».",
      cue: "Сильный рейзер убирает пуш, но не уничтожает ценность пары.",
      lesson: "Против ранней позиции чаще выбираем колл: продолжаем с сильной рукой, не рискуя всем стеком." }),
    spot({ id: "practice-83o-tight-co", title: "Спот 6 · Настоящая граница паса", hand: "83o", cards: ["8s", "3d"], stack: 40, openPosition: "CO", openSize: 2.5,
      question: "Тайтовый CO открыл 2,5 BB. Ты на BB с 83o.", history: "CO открывает редко и выбрал крупный сайзинг",
      profile: { label: "Тайтовый CO", openPct: 24, foldPct: 55, sample: 0 }, recent: ["fold", "open", "fold", "fold", "fold"], correct: "fold",
      feedback: { fold: "Верно: 83o находится у самого низа защиты, а узкий CO и крупный сайз ухудшают цену колла.", call: "Слишком широко: рука плохо реализует эквити, часто доминируется и платит уже 1,5 BB.", jam: "Нет нужных оснований: CO открывает узко и не показывает высокий процент паса на олл-ин." },
      answer: "Базовая линия — пас. Здесь пас объясняет не один признак, а их сумма: 83o у нижней границы, рейзер не на BTN, опен крупнее и фолд-эквити невысокое.",
      cue: "Пас оставляем для настоящего низа защиты, а не для любого неудобного туза или пары.",
      lesson: "Оверфолд против тайтового игрока начинается с нижней границы диапазона, а не с рук вроде A2o или 77." })
  ];
  window.PokerRestealData = Object.freeze({
    version: "resteal-lesson-20260711-v1",
    source: "docs/resteal-lesson-plan.md + field datasets",
    // The tracker export reports net chips_ev / BB, including the blind and
    // average ante already posted. For the BB lesson, rebase comparison rows
    // to the decision the student is replacing: folding costs 1.12 BB.
    comparisonFoldBaselineBb: -1.12,
    dataSources: Object.freeze(["equity169.json", "rank_vs_random169.json", "field_opens.json", "field_vs_jam.json", "field_call_range.json", "hero_outcomes.json", "hero_bustouts.json"]),
    presets: Object.freeze(presets),
    firstSpot: Object.freeze(firstSpot),
    practiceSpots: Object.freeze(practiceSpots)
  });
})();
