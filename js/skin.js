// Изглед на приложението и админа.
// 'clean' = новият изчистен изглед; 'fancy' = старият (цветен, с тъмни карти).
// За връщане на стария изглед за всички: смени 'clean' на 'fancy' тук.
// (За проба само на едно устройство: localStorage 'profitaxi.skin' = 'fancy'.)
(function () {
  var SKIN = 'clean';
  var s = SKIN; try { s = localStorage.getItem('profitaxi.skin') || SKIN; } catch (e) { /* */ }
  document.documentElement.setAttribute('data-skin', s);
})();
