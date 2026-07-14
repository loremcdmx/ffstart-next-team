# FF Poker Learning Hub

Отдельный статический обучающий хаб с тремя интерактивными префлоп-уроками:

**Production:** https://ff-poker-learning-hub.vercel.app

1. **Опен-рейзы по позициям** — диапазоны RFI от EP до BTN и практика на движке симулятора.
2. **Защита BB коллом** — цена колла, сайзинги и диапазоны защиты против пяти позиций.
3. **Рестилы в коротких стеках** — EV пуша, профили соперников и практические раздачи.

## Проверка

```bash
npm run check
npm run dev
```

После запуска откройте `http://127.0.0.1:4173`. Локальный сервер поддерживает те же чистые URL, что и Vercel, например `/rfi-open-position-lesson`.

## Структура

- `index.html`, `hub.css` — отдельная главная хаба;
- `rfi-open-position-lesson.html` — опен-рейзы;
- `bb-call-defense-lesson.html` — защита BB;
- `resteal-lesson.html` — рестилы;
- `poker-simulator.html` — общий движок практики;
- `assets/` — общий UI-kit, симулятор и данные уроков.

Исходники уроков собраны из рабочего среза `ff-start-poker-hub` и зафиксированы здесь как самостоятельный deployable snapshot.
