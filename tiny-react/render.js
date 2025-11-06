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
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    parent: null,
    child: null,
    sibling: null,
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let wipRoot = null;
let currentRoot = null;
let deletions = null;

function commitRoot() {
  // 先处理删除的节点
  deletions.forEach(commitWork);
  // 提交更新的节点
  commitWork(wipRoot.child);
  // 保存当前的根节点，以便下一次更新使用
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }

  const domParent = domParentFiber.dom;
  if (fiber.effectTag === "PLACEMENT" && fiber.dom) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "DELETION") {
    domParent.removeChild(fiber.dom);
    commitDeletion(fiber, domParent);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

// 删除节点的提交函数
function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

// 判断是否为事件
const isEvent = (key) => key.startsWith("on");
// 判断是否为属性
const isProperty = (key) => key !== "children" && !isEvent(key);
// 判断是否为新属性
const isNew = (prev, next) => (key) => prev[key] !== next[key];
// 判断是否被删除的属性
const isGone = (prev, next) => (key) => !(key in next);

// 更新DOM属性函数
function updateDom(dom, prevProps, nextProps) {
  // 移除旧的事件或者修改的事件
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((key) => {
      const eventType = key.toLocaleLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[key]);
    });

  // 添加新的事件
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((key) => {
      const eventType = key.toLocaleLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[key]);
    });

  // 删除旧属性
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((key) => {
      dom[key] = "";
    });

  // 设置新属性
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((key) => {
      dom[key] = nextProps[key];
    });
}

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

    if (!nextUnitOfWork && wipRoot) {
      commitRoot();
    }
  }
  // 没有足够的时间则退出循环，并且请求下一次浏览器空闲的时候执行
  requestIdleCallback(workLoop);
}

// 第一次请求
requestIdleCallback(workLoop);

// 执行单元工作函数
function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
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

// 更新函数组件
function updateFunctionComponent(fiber) {
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

// 更新原生组件
function updateHostComponent(fiber) {
  // fiber对应的DOM元素不存在则创建
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  // 为子元素创建fiber并构建Fiber Tree
  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
}

function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  // 遍历元素和老的fiber节点
  while (index < elements.length || oldFiber) {
    const element = elements[index];
    let newFiber = null;

    const sameType = oldFiber && element && element.type === oldFiber.type;

    if (sameType) {
      // 类型相同，更新节点属性，复用DOM，标记为UPDATE
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }
    if (element && !sameType) {
      // 类型不同且有新元素，创建新节点，标记为PLACEMENT
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT",
      };
    }
    if (oldFiber && !sameType) {
      // 类型不同且没有新元素，删除老节点，标记为DELETION
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      // 第一个子元素作为子fiber
      wipFiber.child = newFiber;
    } else {
      // 其他子元素作为儿子的兄弟fiber
      prevSibling.sibling = newFiber;
    }
    // 每次执行后更新prevSibling
    prevSibling = newFiber;
    index++;
  }
}

export default render;
