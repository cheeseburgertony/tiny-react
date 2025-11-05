// 创建真实DOM元素
function createDom(fiber) {
  // 创建对应的真实DOM元素
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  // 设置DOM元素的属性
  Object.keys(fiber.props)
    .filter((key) => key !== "children")
    .forEach((key) => {
      dom[key] = fiber.props[key];
    });

  return dom;
}

// 渲染函数
function render(element, container) {
  // 创建根fiber
  nextUnitOfWork = {
    dom: container,
    props: {
      children: [element],
    },
    parent: null,
    child: null,
    sibling: null,
  };
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

// 执行单元工作函数
function performUnitOfWork(fiber) {
  // fiber对应的DOM元素不存在则创建
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  if (fiber.parent) {
    // 将当前fiber的DOM元素添加到父fiber的DOM元素中
    fiber.parent.dom.appendChild(fiber.dom);
  }

  // 为子元素创建fiber并构建Fiber Tree
  const elements = fiber.props.children;
  let prevSibling = null;

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    // 创建新的fiber
    const newFiber = {
      type: element.type,
      props: element.props,
      parent: fiber,
      dom: null,
      child: null,
      sibling: null,
    };

    if (i === 0) {
      // 第一个子元素作为子fiber
      fiber.child = newFiber;
    } else {
      // 其他子元素作为儿子的兄弟fiber
      prevSibling.sibling = newFiber;
    }
    // 每次执行后更新prevSibling
    prevSibling = newFiber;
  }

  // 返回下一个工作单元
  if (fiber.child) {
    return fiber.child;
  }

  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

export default render;
