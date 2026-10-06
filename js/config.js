// Обща база данни (тестов период). true = данните се пазят в облака и се виждат от админа.
// false = старото демо: всичко остава само на устройството.
export const LIVE_DEFAULT = true;

// Код по SMS при регистрация. false = само телефон, без код (до истинските SMS).
export const PHONE_CODE = false;

// Публичният ключ за известията на телефона на админа (Web Push). Тайната половина е само на сървъра.
export const VAPID_PUBLIC = 'BDkpKz10Smtz6qGCoWfiEvNLNO3Rd0UKOk-Y-kyrSs-4NHhTmx56VVryMkNLqx6MzyvsHzHe0Xc4oImE3l6fDRA';
