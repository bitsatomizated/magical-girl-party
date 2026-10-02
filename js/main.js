window.addEventListener("DOMContentLoaded", () => {
  try {
    window.Engine.assertConfig(); // 等待所有自定义技能模块注册完成，再检查整个内容库。
  } catch (error) {
    if (error.name !== "ConfigValidationError") throw error;
    console.error(error);
    const message = document.createElement("pre");
    message.setAttribute("role", "alert");
    message.style.whiteSpace = "pre-wrap";
    message.textContent = error.message;
    document.getElementById("start-screen").appendChild(message);
    document.getElementById("btn-start").disabled = true;
    document.getElementById("btn-tutorial").disabled = true;
    return;
  }
  window.UI.renderSetup(); // 开场选择界面；选完点「开始游戏」进入对局
});
