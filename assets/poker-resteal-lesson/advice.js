(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PokerRestealAdvice = api;
})(typeof window !== "undefined" ? window : globalThis, function createRestealAdvice() {
  "use strict";

  const TIPS = [
    {
      id: "fold-trash-theft",
      family: "jam-fold",
      priority: 96,
      title: "Вот как чаще всего и выглядит рестил",
      copy: "У тебя попытались украсть блайнд, ты поставил олл-ин, а {{openerCombo}} отправилась в пас. В широком позднем опене действительно много мусора.",
      when: { heroAction: "jam", response: "fold", spotType: "single-open", openerGroup: "trash" }
    },
    {
      id: "fold-trash-bank",
      family: "jam-fold",
      priority: 94,
      title: "Плохая рука соперника уже принесла тебе фишки",
      copy: "Тебе не пришлось доезжать: {{openerCombo}} выкинула, а готовый банк остался у тебя. Это и есть первая часть ожидания рестила.",
      when: { heroAction: "jam", response: "fold", openerGroup: "trash", openSizeMin: 1.8 }
    },
    {
      id: "fold-marginal-pressure",
      family: "jam-fold",
      priority: 95,
      title: "Олл-ин выбивает не только полный мусор",
      copy: "{{openerCombo}} выглядела играбельно для рейза, но не выдержала олл-ин. В этом разрыве между широким опеном и узким коллом живёт твоя фолд-эквити.",
      when: { heroAction: "jam", response: "fold", spotType: "single-open", openerGroup: "marginal" }
    },
    {
      id: "fold-strong-observe",
      family: "jam-fold",
      priority: 98,
      title: "Запомни эту руку в пасе",
      copy: "Соперник выбросил {{openerCombo}} — руку заметно лучше мусора. Если решение было долгим, это особенно полезная подсказка о его настоящей границе колла.",
      when: { heroAction: "jam", response: "fold", openerGroup: "strong" }
    },
    {
      id: "fold-premium-read",
      family: "jam-fold",
      priority: 100,
      title: "Даже сильные руки иногда уходят в пас",
      copy: "{{openerCombo}} могла выглядеть как рейз-колл, но соперник всё-таки выкинул. Не превращай один показ в закон, но сохрани этот рид для следующих рестилов.",
      when: { heroAction: "jam", response: "fold", openerGroup: "premium" }
    },

    {
      id: "fold-late-open",
      family: "fold-equity",
      priority: 88,
      title: "Поздняя позиция открывает широко",
      copy: "BTN получил шанс забрать блайнды, но не смог продолжить против олл-ина. Ты наказал широкий поздний опен, а не просто сыграл свои две карты.",
      when: { heroAction: "jam", response: "fold", spotType: "single-open", openerPosition: "BTN" }
    },
    {
      id: "fold-dead-money",
      family: "fold-equity",
      priority: 87,
      title: "Банк был твоей наградой ещё до флопа",
      copy: "Рейзер выбросил, и ты забрал {{bankBb}} без вскрытия. В большинстве подходящих спотов именно этот исход делает рестил простым и прибыльным.",
      when: { heroAction: "jam", response: "fold", spotType: "single-open", openerGroup: "unknown" }
    },
    {
      id: "fold-no-stack-gift",
      family: "fold-equity",
      priority: 90,
      title: "Ты не подарил весь стек",
      copy: "После паса соперника олл-ин вернулся к тебе целиком. На кону был не весь стек каждый раз: реальным результатом этой ветки стал выигранный банк.",
      when: { heroAction: "jam", response: "fold", spotType: "single-open", effectiveStackMin: 25 }
    },
    {
      id: "fold-unequal-effective-stack",
      family: "fold-equity",
      priority: 93,
      title: "Рисковал только эффективный стек",
      copy: "Стеки были разными, но разыграться могла лишь меньшая их часть. Лишние фишки большого стека не увеличивали риск этой раздачи.",
      when: { heroAction: "jam", response: "fold", unequalStacks: true }
    },
    {
      id: "fold-run-evidence",
      family: "fold-equity",
      priority: 84,
      title: "Это уже не случайный единичный пас",
      copy: "Соперники несколько раз отдали банк на твой олл-ин. Не пушь автоматически, но замечай: широкий опен действительно не может защищаться всеми руками.",
      when: { heroAction: "jam", response: "fold", sessionFoldsToJamMin: 2 }
    },

    {
      id: "called-win-from-behind",
      family: "called-win",
      priority: 100,
      title: "Ты был снизу — и всё равно выиграл",
      copy: "После колла у {{heroCombo}} оставалось {{equityPct}} эквити, и сейчас эта доля реализовалась. Возможность выиграть выставление — вторая часть ожидания рестила.",
      when: { heroAction: "jam", response: "call", outcome: "win", equityMax: 0.499 }
    },
    {
      id: "called-win-ahead",
      family: "called-win",
      priority: 96,
      title: "Тебя заколлировали хуже",
      copy: "Олл-ин оказался не только защитой блайнда: {{heroCombo}} была впереди диапазона колла и забрала выставление. Иногда рестил просто получает оплату от более слабой руки.",
      when: { heroAction: "jam", response: "call", outcome: "win", equityMin: 0.5 }
    },
    {
      id: "called-win-qjo-model",
      family: "called-win",
      priority: 104,
      title: "Именно ради этой ветки QJo сохраняет шанс",
      copy: "В учебном примере BTN открывает около 50% рук и коллирует около 10%, а QJo имеет против колла примерно 34% эквити. Из 100 пушей модель даёт около 80 пасов, 13 проигрышей и 7 побед — сейчас случилась одна из этих побед.",
      when: { heroAction: "jam", response: "call", outcome: "win", heroCombo: "QJo" }
    },
    {
      id: "called-win-pair",
      family: "called-win",
      priority: 95,
      title: "Пара хорошо пережила колл",
      copy: "{{heroCombo}} не нуждалась в попадании во флоп и сразу реализовала свою силу в олл-ине. Пары часто удобны для рестила именно своей устойчивостью.",
      when: { heroAction: "jam", response: "call", outcome: "win", heroGroup: "pair" }
    },
    {
      id: "called-win-ace",
      family: "called-win",
      priority: 95,
      title: "Сильный туз — это ещё и вэлью",
      copy: "Туз в {{heroCombo}} не только блокировал сильные ответы: после колла рука выиграла весь банк. Хороший рестил умеет и воровать, и выигрывать выставление.",
      when: { heroAction: "jam", response: "call", outcome: "win", heroGroup: "ace" }
    },

    {
      id: "called-loss-good-decision",
      family: "called-loss",
      priority: 94,
      title: "Проигрыш не делает решение плохим",
      copy: "Соперник заколлировал, и этот ран-аут проигран. Оценивай не последнюю карту, а все ветки решения: пас соперника, победу при колле и поражение при колле.",
      when: { heroAction: "jam", response: "call", outcome: "loss" }
    },
    {
      id: "called-loss-connector",
      family: "called-loss",
      priority: 99,
      title: "Связка уязвима к оптимистичным коллам",
      copy: "{{heroCombo}} красиво выглядит, но против широкого колла двумя более высокими картами ей тяжело. Низкие одномастные связки — первые кандидаты, которые можно оставить в колле вместо пуша.",
      when: { heroAction: "jam", response: "call", outcome: "loss", heroGroup: "connector" }
    },
    {
      id: "called-loss-broadway",
      family: "called-loss",
      priority: 92,
      title: "Две высокие карты не обязаны доехать",
      copy: "{{heroCombo}} получила колл и проиграла выставление, но у неё всё равно была живая доля банка. Твоя задача — выбирать выгодную развилку, а не выигрывать каждый олл-ин.",
      when: { heroAction: "jam", response: "call", outcome: "loss", heroGroup: "broadway" }
    },
    {
      id: "called-loss-ace",
      family: "called-loss",
      priority: 93,
      title: "Блокер не гарантирует победу",
      copy: "Туз в {{heroCombo}} уменьшал число сильных рук у соперника, но не отменял их полностью. Блокер помогает ожиданию решения, а не обещает конкретный результат.",
      when: { heroAction: "jam", response: "call", outcome: "loss", heroGroup: "ace" }
    },
    {
      id: "called-loss-red-bot",
      family: "called-loss",
      priority: 97,
      title: "Сильный бот продолжил узко",
      copy: "Красный соперник близок к топ-модели, поэтому его колл чаще представляет дисциплинированный диапазон. Упереться в сильную руку здесь нормально — это не отменяет фолд-эквити против всего опена.",
      when: { heroAction: "jam", response: "call", outcome: "loss", botTier: "red" }
    },

    {
      id: "green-call-broadway",
      family: "green-caller",
      priority: 112,
      title: "Зелёный соперник коллирует оптимистично",
      copy: "Он продолжил с {{callerCombo}}. Против таких коллов выгоднее пушить устойчивые руки и сильные непарные комбинации вроде AQ и AK, а самые низкие связки чаще оставлять в колле.",
      when: { heroAction: "jam", response: "call", botTier: "green", callerCombo: ["JTs", "KJs", "QTs", "JTo", "KJo"] }
    },
    {
      id: "green-call-marginal",
      family: "green-caller",
      priority: 111,
      title: "Фиш защищает опен шире обычного",
      copy: "Колл с {{callerCombo}} показывает, что одной фолд-эквити против этого игрока будет меньше. Сдвигай пуши к рукам, которые хорошо стоят против его любопытных ответов.",
      when: { heroAction: "jam", response: "call", botTier: "green", callerCombo: ["A8o", "A7o", "KTo", "QJo", "98s", "87s", "76s"] }
    },
    {
      id: "green-call-pair",
      family: "green-caller",
      priority: 108,
      title: "Пара — нормальная рука для колла",
      copy: "{{callerCombo}} может выглядеть скромно, но любая готовая пара — вполне обычный колл рестила. Не принимай этот показ за доказательство слишком широкого колла.",
      when: { heroAction: "jam", response: "call", botTier: "green", callerGroup: "pair" }
    },
    {
      id: "green-call-premium",
      family: "green-caller",
      priority: 114,
      title: "Иногда даже зелёный покажет нацы",
      copy: "Цвет бота описывает общую силу, а не запрещает ему получать {{callerCombo}}. Один сильный колл не доказывает, что твой рестил был ошибкой.",
      when: { heroAction: "jam", response: "call", botTier: "green", callerGroup: "premium" }
    },
    {
      id: "green-call-unknown",
      family: "green-caller",
      priority: 103,
      title: "Слабый бот — не синоним автоматического паса",
      copy: "Зелёный игрок заколлировал. Отмечай не только частоту его пасов, но и руки на вскрытии: они подскажут, насколько устойчивым должен быть твой следующий пуш.",
      when: { heroAction: "jam", response: "call", botTier: "green", callerGroup: "unknown" }
    },

    {
      id: "call-broadway-complexity",
      family: "hero-call",
      priority: 89,
      title: "Колл может быть плюсовым, но путь сложнее",
      copy: "С {{heroCombo}} ты сохранил широкий диапазон, но теперь играешь без позиции и принимаешь новые решения на флопе. Для новичка эта цена внимания особенно важна.",
      when: { heroAction: "call", spotType: "single-open", heroGroup: "broadway" }
    },
    {
      id: "call-connector-legitimate",
      family: "hero-call",
      priority: 93,
      title: "Низкая связка умеет защищаться коллом",
      copy: "{{heroCombo}} не обязана становиться рестилом. Колл скрывает ширину твоих пушей и не подставляет руку под слишком оптимистичный ответ более высоких карт.",
      when: { heroAction: "call", spotType: "single-open", heroGroup: "connector" }
    },
    {
      id: "call-pair-postflop",
      family: "hero-call",
      priority: 86,
      title: "Пара осталась в игре — решения продолжатся",
      copy: "Колл с {{heroCombo}} может быть нормальным, но теперь придётся разыгрывать флоп без позиции. Сравнивай эту линию с простым олл-ином, который сразу реализует всё ожидание.",
      when: { heroAction: "call", spotType: "single-open", heroGroup: "pair" }
    },
    {
      id: "call-premium-trap",
      family: "hero-call",
      priority: 98,
      title: "Сильную руку иногда можно оставить в колле",
      copy: "С {{heroCombo}} колл может маскировать силу и сохранять худшие руки соперника. Для TT+ обе линии бывают уместны — это не та же причина, что колл со слабой рукой.",
      when: { heroAction: "call", spotType: "single-open", heroGroup: "premium" }
    },
    {
      id: "call-green-attention-cost",
      family: "hero-call",
      priority: 91,
      title: "Не покупай сложный постфлоп без причины",
      copy: "Против зелёного игрока колл оставляет тебя в большом банке без позиции и отвлекает от других столов. Крепкий олл-ин нередко и проще, и выгоднее.",
      when: { heroAction: "call", spotType: "single-open", botTier: "green" }
    },

    {
      id: "hero-fold-trash",
      family: "hero-fold",
      priority: 85,
      title: "Не каждый большой блайнд нужно спасать",
      copy: "С мусорной {{heroCombo}} пас сохранил фишки. Урок про рестил не превращает кнопку олл-ина в обязательный ответ на любой рейз.",
      when: { heroAction: "fold", spotType: "single-open", heroGroup: "trash" }
    },
    {
      id: "hero-fold-marginal",
      family: "hero-fold",
      priority: 88,
      title: "Это уже пограничная зона",
      copy: "{{heroCombo}} выглядит лучше мусора, поэтому автоматический пас может стоить ожидания. Проверь позицию опенера, стек и его готовность коллировать, прежде чем сдавать блайнд.",
      when: { heroAction: "fold", spotType: "single-open", heroGroup: "marginal" }
    },
    {
      id: "hero-fold-strong",
      family: "hero-fold",
      priority: 101,
      title: "Похоже, ты отдал слишком много",
      copy: "Сильная {{heroCombo}} против одного позднего опена часто заслуживает активной защиты. Именно такие автоматические пасы новичков рестил и должен исправить.",
      when: { heroAction: "fold", spotType: "single-open", heroGroup: "strong" }
    },
    {
      id: "hero-fold-early",
      family: "hero-fold",
      priority: 95,
      title: "Ты заметил, что это не поздний стил",
      copy: "Рейз пришёл из ранней позиции, где диапазон обычно сильнее. Пас здесь нельзя оценивать по правилам рестила против CO или BTN — это другой спот.",
      when: { heroAction: "fold", spotType: "early-open" }
    },
    {
      id: "hero-fold-open-call",
      family: "hero-fold",
      priority: 97,
      title: "Рейз и колл меняют всю развилку",
      copy: "Перед тобой уже два игрока, поэтому обычная формула рестила против одного вора не подходит. Ты правильно остановился и перечитал экшен.",
      when: { heroAction: "fold", spotType: "open-call" }
    },

    {
      id: "small-threebet-stack",
      family: "small-threebet",
      priority: 96,
      title: "25–40 BB — не слишком глубоко для пуша",
      copy: "Малый трибет кажется безопаснее, но оставляет новые решения и даёт сопернику больше способов продолжить. В чистом позднем споте обязательно сравни его с олл-ином.",
      when: { heroAction: "raise", spotType: "single-open", effectiveStackMax: 40 }
    },
    {
      id: "small-threebet-broadway",
      family: "small-threebet",
      priority: 92,
      title: "Ты оставил себе постфлоп вместо готового решения",
      copy: "С {{heroCombo}} маленький трибет не завершил раздачу и может привести к сложному банку без позиции. Олл-ин часто реализует ожидание проще.",
      when: { heroAction: "raise", spotType: "single-open", heroGroup: "broadway" }
    },
    {
      id: "small-threebet-green",
      family: "small-threebet",
      priority: 94,
      title: "Против любителя размер должен иметь цель",
      copy: "Зелёный соперник способен широко продолжить и на небольшой трибет. С сильной устойчивой рукой олл-ин сразу берёт максимум фолд-эквити и не оставляет трудный флоп.",
      when: { heroAction: "raise", spotType: "single-open", botTier: "green" }
    },
    {
      id: "small-threebet-early",
      family: "small-threebet",
      priority: 98,
      title: "Ранняя позиция — уже другой диапазон",
      copy: "Ты трибетнул ранний опен. Здесь нельзя переносить готовый рестил-чарт против BTN: у рейзера сильнее стартовый набор, а продолжение требует отдельного расчёта.",
      when: { heroAction: "raise", spotType: "early-open" }
    },
    {
      id: "small-threebet-open-call",
      family: "small-threebet",
      priority: 99,
      title: "Сквиз — не тот же самый рестил",
      copy: "Рейзер уже получил колл, поэтому в банке больше денег и больше диапазонов. Малый трибет здесь запускает отдельное дерево решений — не путай его с пушем против одного опенера.",
      when: { heroAction: "raise", spotType: "open-call" }
    },

    {
      id: "spot-limp-check",
      family: "read-the-action",
      priority: 103,
      title: "Лимп — не попытка украсть блайнд рейзом",
      copy: "Перед тобой не было чистого опена, и ты мог бесплатно увидеть флоп. Хорошая пауза: сначала прочитай действие, а уже потом ищи рестил.",
      when: { heroAction: "check", spotType: "limp" }
    },
    {
      id: "spot-limp-jam",
      family: "read-the-action",
      priority: 105,
      title: "Олл-ин против лимпа требует другой причины",
      copy: "Лимпер не показал тот же широкий рейз, который мы наказываем рестилом. Такой пуш может быть изоляцией, но его нельзя оправдывать одной логикой урока.",
      when: { heroAction: "jam", spotType: "limp" }
    },
    {
      id: "spot-early-any",
      family: "read-the-action",
      priority: 97,
      title: "Сначала позиция, потом карты",
      copy: "Опен пришёл рано, а значит базово содержит больше сильных рук. Остановись: это не автоматический рестил-спот против широкого CO или BTN.",
      when: { heroAction: ["jam", "call", "raise", "check"], spotType: "early-open" }
    },
    {
      id: "spot-open-call-any",
      family: "read-the-action",
      priority: 98,
      title: "Дополнительный коллер — важнее красоты руки",
      copy: "После рейза уже вошёл ещё один игрок. Его деньги увеличили банк, но его диапазон также уменьшил твою фолд-эквити — нужен отдельный расчёт, а не готовая кнопка.",
      when: { heroAction: ["jam", "call", "raise", "check"], spotType: "open-call" }
    },
    {
      id: "spot-other-stop",
      family: "read-the-action",
      priority: 90,
      title: "Экшен не совпал с базовым рестилом",
      copy: "Чистый учебный спот — один поздний опен, эффективный стек 25–40 BB и ты на большом блайнде. Если что-то изменилось, остановись и перечитай стол.",
      when: { heroAction: ["jam", "fold", "call", "raise", "check"], spotType: "other" }
    },

    {
      id: "fgs-repeated-red",
      family: "future-game",
      priority: 109,
      title: "Сильный соперник уже видел твои рестилы",
      copy: "Это повторная встреча с красным ботом. FGS напоминает: он может открываться аккуратнее и коллировать шире, если заметил твою частоту — теперь выбор рук важнее.",
      when: { heroAction: "jam", spotType: "single-open", botTier: "red", repeatedVillain: true, sameVillainSpotsMin: 2 }
    },
    {
      id: "fgs-repeat-boundary",
      family: "future-game",
      priority: 105,
      title: "Ищи признаки реальной подстройки",
      copy: "С этим игроком спот повторился. Обращай внимание на долгие решения и показанные руки: они полезнее догадки о том, что соперник обязательно уже изменил стратегию.",
      when: { heroAction: ["jam", "fold", "call", "raise"], repeatedVillain: true, sameVillainSpotsMin: 2 }
    },
    {
      id: "session-restil-windows",
      family: "future-game",
      priority: 83,
      title: "Рестил — редкое окно, а не каждую руку",
      copy: "За сессию появилось уже несколько подходящих решений. За полным столом таких окон обычно немного, поэтому важно сначала распознать спот и только потом выбирать действие.",
      when: { heroAction: "jam", spotType: "single-open", sessionHandsMin: 5, sessionJamsMin: 2 }
    },
    {
      id: "session-big-pool",
      family: "future-game",
      priority: 82,
      title: "Не бойся нотса после одного широкого пуша",
      copy: "Соперник встретился тебе впервые, а пул игроков большой. Не урезай выгодные рестилы заранее: учитывай будущую подстройку только когда видишь повторения или явные сигналы.",
      when: { heroAction: "jam", spotType: "single-open", repeatedVillain: false, sessionJamsMin: 2 }
    },
    {
      id: "effective-stack-unequal",
      family: "future-game",
      priority: 101,
      title: "Смотри на меньший из двух стеков",
      copy: "Стеки за столом не равны, но в олл-ине участвует только эффективный — меньший из твоего и стека оппонента. Именно его сравнивай с диапазоном 25–40 BB.",
      when: { heroAction: ["jam", "fold", "call", "raise"], spotType: "single-open", unequalStacks: true }
    }
  ];

  const COMBO_RANKS = Object.freeze({
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  });

  function normalizeCombo(value) {
    const raw = String(value || "").trim().replace(/10/gi, "T");
    const match = raw.match(/^([2-9TJQKA])([2-9TJQKA])([so])?$/i);
    if (!match) return raw.toLowerCase();
    let first = match[1].toUpperCase();
    let second = match[2].toUpperCase();
    const suffix = match[3] ? match[3].toLowerCase() : "";
    if (COMBO_RANKS[first] < COMBO_RANKS[second]) [first, second] = [second, first];
    return `${first}${second}${first === second ? "" : suffix}`;
  }

  function comparable(value, key) {
    if (key && /combo$/i.test(key)) return normalizeCombo(value);
    if (typeof value === "string") return value.trim().toLowerCase();
    return value;
  }

  function sessionKey(key) {
    if (!/^session[A-Z]/.test(key)) return "";
    return key.slice(7, 8).toLowerCase() + key.slice(8);
  }

  function contextValue(context, key) {
    if (!context || typeof context !== "object") return undefined;
    if (Object.prototype.hasOwnProperty.call(context, key)) return context[key];
    const nestedSessionKey = sessionKey(key);
    if (nestedSessionKey && context.session && Object.prototype.hasOwnProperty.call(context.session, nestedSessionKey)) {
      return context.session[nestedSessionKey];
    }
    if (key === "equity") {
      if (Number.isFinite(Number(context.equityPct))) {
        const equityPct = Number(context.equityPct);
        return equityPct <= 1 ? equityPct : equityPct / 100;
      }
      if (Number.isFinite(Number(context.heroEquity))) return Number(context.heroEquity);
    }
    if (key === "openSize") return context.openSizeBb;
    if (key === "effectiveStack") return context.effectiveStackBb ?? context.stackBb;
    if (key === "sameVillainSpots") return context.villainSpotCount;
    if (key === "repeatedVillain" && context.sameVillainSpots != null) {
      return Number(context.sameVillainSpots) > 1;
    }
    return undefined;
  }

  function matchesScalar(actual, expected, key) {
    if (Array.isArray(expected)) return expected.some((item) => matchesScalar(actual, item, key));
    if (Array.isArray(actual)) return actual.some((item) => matchesScalar(item, expected, key));
    if (actual == null) return false;
    return comparable(actual, key) === comparable(expected, key);
  }

  function matchesRange(actual, range) {
    const value = Number(actual);
    if (!Number.isFinite(value)) return false;
    if (range.min != null && value < Number(range.min)) return false;
    if (range.max != null && value > Number(range.max)) return false;
    return true;
  }

  function matchesTip(tip, context) {
    if (!tip || !tip.when || !context) return false;
    return Object.entries(tip.when).every(([rawKey, expected]) => {
      const boundary = rawKey.match(/^(.*?)(Min|Max)$/);
      if (boundary) {
        const actual = contextValue(context, boundary[1]);
        const value = Number(actual);
        const limit = Number(expected);
        if (!Number.isFinite(value) || !Number.isFinite(limit)) return false;
        return boundary[2] === "Min" ? value >= limit : value <= limit;
      }
      if (expected && typeof expected === "object" && !Array.isArray(expected)
        && (Object.prototype.hasOwnProperty.call(expected, "min") || Object.prototype.hasOwnProperty.call(expected, "max"))) {
        return matchesRange(contextValue(context, rawKey), expected);
      }
      return matchesScalar(contextValue(context, rawKey), expected, rawKey);
    });
  }

  function matchingTips(context) {
    return TIPS.filter((tip) => matchesTip(tip, context));
  }

  function stableHash(value) {
    const input = String(value ?? "");
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function usageFor(usage, id) {
    if (usage instanceof Map) return Number(usage.get(id) || 0);
    if (usage && typeof usage === "object") return Number(usage[id] || 0);
    return 0;
  }

  function specificity(tip) {
    return Object.values(tip?.when || {}).reduce((score, expected) => {
      if (Array.isArray(expected)) return score + 1 + Math.min(1, 1 / Math.max(1, expected.length));
      if (expected && typeof expected === "object") return score + 1.5;
      return score + 1;
    }, 0);
  }

  function selectTip(context, state = {}, seed = "") {
    let candidates = matchingTips(context);
    if (!candidates.length) return null;

    const recentIds = new Set((Array.isArray(state.lastIds) ? state.lastIds : []).slice(-3));
    const withoutRecent = candidates.filter((tip) => !recentIds.has(tip.id));
    if (withoutRecent.length) candidates = withoutRecent;

    if (state.lastFamily) {
      const withoutLastFamily = candidates.filter((tip) => tip.family !== state.lastFamily);
      if (withoutLastFamily.length) candidates = withoutLastFamily;
    }

    const tieSeed = `${seed}|${context?.entryId || context?.handId || context?.handNo || ""}`;
    candidates.sort((left, right) => {
      const usageDifference = usageFor(state.usage, left.id) - usageFor(state.usage, right.id);
      if (usageDifference) return usageDifference;
      const priorityDifference = Number(right.priority || 0) - Number(left.priority || 0);
      if (priorityDifference) return priorityDifference;
      const specificityDifference = specificity(right) - specificity(left);
      if (specificityDifference) return specificityDifference;
      const hashDifference = stableHash(`${tieSeed}|${left.id}`) - stableHash(`${tieSeed}|${right.id}`);
      if (hashDifference) return hashDifference;
      return left.id.localeCompare(right.id);
    });
    return candidates[0] || null;
  }

  function numberLabel(value, maximumFractionDigits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits }).format(number);
  }

  function displayValue(key, context) {
    const direct = contextValue(context, key);
    if (key === "equityPct") {
      const percent = Number(direct);
      if (Number.isFinite(percent)) return `${numberLabel(percent <= 1 ? percent * 100 : percent)}%`;
      const equity = Number(contextValue(context, "equity"));
      return Number.isFinite(equity) ? `${numberLabel(equity * 100)}%` : "свою долю";
    }
    if (key === "bankBb") {
      const bank = direct ?? context?.potBb;
      return Number.isFinite(Number(bank)) ? `${numberLabel(bank)} BB` : "банк";
    }
    if (key === "openSizeBb") {
      const openSize = direct ?? contextValue(context, "openSize");
      return Number.isFinite(Number(openSize)) ? `${numberLabel(openSize)} BB` : "рейз";
    }
    if (direct != null && direct !== "") {
      if (/combo$/i.test(key)) return normalizeCombo(direct).replace(/^([a-z])/, (letter) => letter.toUpperCase());
      return String(direct);
    }
    if (key === "heroCombo") return "твоя рука";
    if (key === "openerCombo") return "его рука";
    if (key === "callerCombo") return "рука соперника";
    return "";
  }

  function interpolate(template, context) {
    return String(template || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => displayValue(key, context));
  }

  function renderTip(tip, context = {}) {
    if (!tip) return null;
    return {
      ...tip,
      title: interpolate(tip.title, context),
      copy: interpolate(tip.copy, context)
    };
  }

  const frozenTips = Object.freeze(TIPS.map((tip) => Object.freeze({
    ...tip,
    when: Object.freeze({ ...tip.when })
  })));

  return Object.freeze({
    TIPS: frozenTips,
    matchesTip,
    matchingTips,
    stableHash,
    selectTip,
    renderTip,
    normalizeCombo
  });
});
