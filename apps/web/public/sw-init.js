(function () {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    navigator.serviceWorker.getRegistrations().then(function (rs) {
      rs.forEach(function (r) { r.unregister(); });
    });
    return;
  }

  // 仅当本页"已被某个 SW 控制"（即非首次注册）时，后续 controllerchange = 新版本接管 → 刷新一次。
  // 这样新部署的前端能自动到达已安装的 PWA / 常驻页面，不再"部署了但手机端还是旧代码"。
  // 首次注册（controller 为空）不挂此监听，避免初次 claim 触发无谓刷新。
  if (navigator.serviceWorker.controller) {
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      var check = function () { try { reg.update(); } catch (e) { /* ignore */ } };
      check();                                   // 进页面即检查新版本
      setInterval(check, 60 * 1000);             // 之后每分钟检查
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();  // 回到前台再查（PWA 常驻场景关键）
      });
    }).catch(function (err) {
      console.warn('[Phoenix SW] register failed:', err);
    });
  });
})();
