// Изглед на приложението и админа:
//   'fancy' = вариант 1 (цветен, тъмни карти, сияния)
//   'clean' = вариант 2 (изцяло изчистен, сиво-бял)
//   'mid'   = вариант 3 (изчистен, но с цветни контури и иконки)
//   'google'= вариант 4 (като приложенията на Google – Material Design 3)
// Изгледът за всички се сменя от SKIN по-долу.
// За проба на едно устройство: отвори адреса с ?v=1, ?v=2, ?v=3 или ?v=4 (запомня се); ?v=0 – по подразбиране.
(function () {
  var SKIN = 'google';
  var MAP = { '1': 'fancy', '2': 'clean', '3': 'mid', '4': 'google' };
  var s = SKIN;
  try {
    var q = (location.search.match(/[?&]v=(\d)/) || [])[1];
    if (q === '0') localStorage.removeItem('profitaxi.skin');
    else if (MAP[q]) localStorage.setItem('profitaxi.skin', MAP[q]);
    s = localStorage.getItem('profitaxi.skin') || SKIN;
  } catch (e) { /* */ }
  document.documentElement.setAttribute('data-skin', s);
})();
