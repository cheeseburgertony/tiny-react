function render(element, container) {
  // 创建对应的真实DOM元素
  const dom =
    element.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(element.type);

  // 设置DOM元素的属性
  Object.keys(element.props)
    .filter((key) => key !== "children")
    .forEach((key) => {
      dom[key] = element.props[key];
    });

  // 将创建的DOM元素添加到容器（父元素）中
  container.appendChild(dom);
}

let nextUnitOfWork = null;

// 工作循环 调度函数（替换之前的递归渲染）
function workLoop(deadline) {
  // 是否停止
  let shouldYield = false;

  // 还有任务并且不应该退出的时候
  while (nextUnitOfWork && !shouldYield) {
    // 执行单元工作并且拿到下一个工作单元
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // 判断在这一帧中是否还有足够的时间
    shouldYield = deadline.timeRemaining() < 1;
  }
  // 没有足够的时间则退出循环，并且请求下一次浏览器空闲的时候执行
  requestIdleCallback(workLoop);
}

// 第一次请求
requestIdleCallback(workLoop);

function performUnitOfWork(nextUnitOfWork) {}

export default render;
