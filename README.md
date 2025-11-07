# Tiny React

一个简化版的 React 实现,用于理解 React 核心原理,包括虚拟 DOM、Fiber 架构、协调算法和 Hooks。

## 功能特性

- ✅ 虚拟 DOM (Virtual DOM)
- ✅ JSX 替代方案 (createElement)
- ✅ Fiber 架构
- ✅ 协调算法 (Reconciliation)
- ✅ 函数组件 (Function Components)
- ✅ Hooks (useState)
- ✅ 事件处理
- ✅ 可中断的渲染 (使用 requestIdleCallback)

## 项目结构

```
tiny-react/
├── src/
│   └── main.js           # 示例应用
├── tiny-react/
│   ├── createElement.js  # 创建虚拟 DOM 元素
│   ├── render.js         # 渲染和协调逻辑
│   └── index.js          # 导出接口
├── index.html            # HTML 入口
└── package.json
```

## 实现过程
### Step1：实现createElement函数
在React中，我们编写的jsx代码最终会被转换为js，于是jsx会变为是`createElement`的调用。我们通过`createElement`来创建一个js对象（虚拟DOM），用于对真实DOM的描述，方便后续进行渲染。

`createElement`接受元素的类型、属性以及它的children，其中从第三个参数开始都是它的children，所以通过剩余参数获取。

最终返回的一个对象，children会在props中，并且是作为一个数组。对于child，我们需要做额外的判断，他可能是一个一样由`createElement`创建出来的对象（直接进行返回），也可能一个字符串类型的child，通过`createTextElement`创建成为一个文件节点后再返回，目的是为了保证它们的结构一致。

```javascript
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

```


### Step2：渲染函数
有了对应描述真实DOM的js对象，这时候需要实现一个渲染函数来将其渲染为真实DOM。

通过js对象（React的Element）中的type来创建对应的DOM节点，并且将新节点追加到对应的父节点容器中，并且对此元素的children都递归地做这样的操作。

在创建DOM的时候要分情况如果是文本的节点需要通过`createTextNode`去创建文本节点。
此外还需要将对应的props添加到DOM的属性上，直接遍历props的keys添加即可，不过需要排除props中的children。

```javascript
function render(element, container) {
  const dom =
    element.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(element.type);

  Object.keys(element.props)
    .filter((key) => key !== "children")
    .forEach((key) => {
      dom[key] = element.props[key];
    });

  element.props.children.forEach((child) => render(child, dom));
  container.appendChild(dom);
}
```


### Step3：实现并发模式
针对上面实现的渲染方法，其实存在一些性能问题。上面的渲染（构建虚拟DOM和渲染成真实DOM）操作是同步的，也就是说一但我们开始渲染，会直到渲染完完整的元素树，否则是不会停止的，如果遇到元素树比较大的，它可能就直接阻塞了主线程，无法去执行优先级高的事情，导致用户感觉卡顿。

所以需要将整个工作分解为几个工作单元，在完成每个单元工作的时候，如果还有其他高优先级的事情要处理的就让浏览器先中断渲染处理。这里使用[`requestIdleCallback`](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestIdleCallback)来实现（在真实的React中已经使用[scheduler package](https://github.com/facebook/react/tree/master/packages/scheduler)实现了），它的作用就是会在主线程空闲时进行回调。

所以我们通过一个wookLoop工作循环，[`requestIdleCallback`](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestIdleCallback)给它传递一个`deadline`，用于判断剩余的时间是否足够进行渲染。进入这个工作循环中，会一直循环执行`performUnitOfWork`传入一个工作取到下一个要执行的工作单元，会在这一帧中空闲时间不够的时候退出循环，并且请求下一次浏览器空闲的时候执行。

```javascript
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
```


### Step4：Fiber架构
使用 Fiber 数据结构来表示工作单元,使渲染过程可中断。  
fiber会先从上往下去找child，如果有孩子就用孩子的fiber作为下一个工作单元，没有孩子则找自己的sibling去做下一个工作单元。如果没有则会往上找到父节点的sibling的fiber，直到一直往上到达根，这时就说明我们完成了渲染的所有工作了。

**Fiber 节点结构:**
```javascript
{
  type,           // 元素类型
  props,          // 属性
  dom,            // 对应的真实 DOM
  parent,         // 父 Fiber
  child,          // 第一个子 Fiber
  sibling,        // 兄弟 Fiber
  alternate,      // 上一次渲染的 Fiber
  effectTag,      // 操作类型: PLACEMENT/UPDATE/DELETION
  hooks           // 存储 hooks 状态
}

```

将render中原本的创建真实DOM的代码进行抽离，放到createDom中。在render函数中先将`nextUnitOfWork`这里在render函数中也就是第一个工作单元，先将它设置为FiberTree的根，也就是它的dom就是外界传入的container，children是传入的element。

当`workLoop`执行的时候就会通过`performUnitOfWork`去执行每一个工作单元。在`performUnitOfWork`中他接受一个工作单元（也就是一个fiber），先判断fiber中是否存在dom，没有则进行创建，再判断fiber中是否存在parent，存在则将这个dom追加到它父Fiber的dom中。然后继续遍历他的所有children创建对应的fiber。针对于fiber的结构，只有第一个fiber的child，后面其他的子节点只能是新创建的fiber的sibling。

因为`performUnitOfWork`它也是需要返回下一个工作单元，所以这里需要寻找下一个工作单元，在上面给children创建完对应的fiber的循环后。判断fiber是否存在child，存在则返回。不存在则找到自己的兄弟姐妹sibling，存在则返回，如果还不存在则往上找到父fiber，返回它的sibling，如果还没有则继续往上找，一直到根。

```javascript
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

```


### Step5：渲染（Render）和提交（Commit）阶段  
在每次处理元素的时候都会向dom添加一个节点，当时目前的渲染操作时随时可以进行中断的，它是异步的，所以也就是说用户可能会看到不完整的页面。为了避免这样的情况，我们引入了wipRoot用于追踪FiberTree的根。

当我们直到整棵树完成了渲染操作，也就是它的虚拟DOM树完全构建完成了（我们可以通过它没有下一个工作单元可以执行来判断），我们再将整棵FiberTree提交给DOM，让他完成最终到真实DOM的渲染。

```JavaScript
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
  };
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let wipRoot = null;

function commitRoot() {
  commitWork(wipRoot.child);
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  const domParent = fiber.parent.dom;
  domParent.appendChild(fiber.dom);
  
  commitWork(fiber.child);
  commitWork(fiber.sibling);
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
  // fiber对应的DOM元素不存在则创建
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
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
```


### Step6：协调算法 Reconciliation（diff）
Reconciliation 就是通过比较新旧虚拟DOM树，然后生成最小的更新对象来更新真DOM树。

因为要比较新旧FiberTree，所以也就是需要比较本次即将让真实DOM渲染的树和上一次以及渲染的虚拟树进行比较，所以需要一个新的变量`currentRoot`来保存之前的wipRoot，并且再fiber结构中加入alternate属性，用于做新旧FiberTree之前的切换。

从`performUnitOfWork`提取构建Fiber的代码，写在新函数`reconcileChildren`中，在这个函数中实现新旧虚拟DOM树的比较。通过`wipFiber.alternate`获取到上一次的FiberTree，获取到它的子级。并和本次的elements去进行比较。

如果旧的fiber和新元素具有相同的类型，则可以保留新的节点，只更新新的props。标记为`UPDATE`
如果类型不同，并且有新元素，则说明需要创建一个新的DOM节点。标记为`PLACEMENT`
如果类型不同，并且有旧fiber，则说明需要移除旧的节点。`DELETION`，对于需要删除的节点，需要使用`deletions`数组来保存。在进行`commitRoot`提交的时候先遍历执行，删除对于节点。

接着调整`commitWork`的内容，不再只是简单地追加到父元素中。而是通过fiber上地effectTag来进行判断是进行添加、删除还是只是更新dom上的属性。

通过`updateDom`来更新dom上的属性，首先是对于非children的属性，先遍历旧的节点上的属性，是否在新节点上还存在，不存在则直接设置为空，然后再遍历新节点上的属性，添加对应的新属性。同样对事件相关的执行对应的操作，先移除旧的事件（新节点上没有的），再添加本地新增的事件。

```JavaScript
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
```


### Step7：函数组件实现
到目前位置，我们都是通过creatElement的形式来创建组件，还需要实现通过函数组件的形式来创建组件。首先有两个点，函数组件的fiber是没有DOM的，并且它的孩子需要通过执行该函数才能获取到。所以在`performUnitOfWork`中需要判断接受的是一个函数组件还是原生组件。

如果是函数组件，则需要通过执行这个函数，并传入对应的props来获取到对应的children，再传入`reconcileChildren`函数。

并且由于函数组件它没有对应的DOM元素，所以对于添加操作需要找到它的上一个父元素进行append，对于删除操作需要通过找到它的下一个子元素进行删除。所以还需要在`commitWork`中进行修改。通过循环的方式一直往上找，找到它的带有DOM节点的父节点，在追加到这个父节点上。通过递归的方式，一直往下去找到它对应的存在DOM的子节点，然后将它删除。

```JavaScript
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
```
  

### Step8：Hooks实现
实现`useState`Hook，支持函数组件的状态管理。

在实现这个hook之前需要在全局添加一些变量用于对它进行追踪像`wipFiber`和`hookIndex`，并且在fiber的结构中还添加了一个hooks数组，用于在多次调用`useState`时进行追踪。

开始实现`useState`，先检查旧的fiber上是否存在有旧的hook，如果存在则使用之前hook的状态，否则则将当前hook的状态调整为传入的初始值。并且需要将将这个hook加入到fiber中对应的hooks数组中，同时索引加1。最终以数组的形式返回状态。

完成了state的实现，需要完成setState用于对state进行操作。这个setState可能会进行多次操作，随意同样的，在hook中添加一个队列，当外部调用这个setState的时候就将传入的action加入到hook的队列中。同时创建一个新的wipFiber并且设置为下一个工作单元，用于触发下一次的渲染。同样setState也放在数组中一起返回。

所以在下一次渲染的时候，就从旧的hook中取出对应存储的队列，遍历整个队列，然后执行其中的所有actions，并且传入之前旧的state，执行后得到一个新的state，重新赋值到hoos.state上。至此完成state的更新。

```JavaScript
let wipFiber = null;
let hookIndex = null;

// 更新函数组件
function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

export function useState(initial) {
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];

  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    // 将新的状态更新加入队列
    hook.queue.push(action);
    // 重新触发渲染
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}
```


## 核心原理解析

### 1. createElement - 创建虚拟 DOM

实现了类似 `React.createElement` 的函数,用于创建虚拟 DOM 对象。

**核心代码:** [tiny-react/createElement.js](tiny-react/createElement.js)

```javascript
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}
```

**特点:**
- 支持元素类型 (原生 DOM 标签或函数组件)
- 处理 props 属性
- 将子元素标准化,文本节点转换为对象形式

### 2. Fiber 架构

使用 Fiber 数据结构来表示工作单元,使渲染过程可中断。

**Fiber 节点结构:**
```javascript
{
  type,           // 元素类型
  props,          // 属性
  dom,            // 对应的真实 DOM
  parent,         // 父 Fiber
  child,          // 第一个子 Fiber
  sibling,        // 兄弟 Fiber
  alternate,      // 上一次渲染的 Fiber
  effectTag,      // 操作类型: PLACEMENT/UPDATE/DELETION
  hooks           // 存储 hooks 状态
}
```

### 3. 渲染流程

#### 3.1 工作循环 (Work Loop)

使用 [`requestIdleCallback`](tiny-react/render.js) 在浏览器空闲时执行渲染工作:

```javascript
function workLoop(deadline) {
  let shouldYield = false;
  
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
    
    if (!nextUnitOfWork && wipRoot) {
      commitRoot();
    }
  }
  
  requestIdleCallback(workLoop);
}
```

**优点:**
- 不阻塞主线程
- 渲染过程可中断
- 提升用户体验

#### 3.2 执行工作单元

[`performUnitOfWork`](tiny-react/render.js) 函数处理每个 Fiber 节点:

1. **函数组件:** 调用函数获取子元素
2. **原生组件:** 创建 DOM 节点
3. **构建 Fiber 树:** 处理子元素和兄弟元素

```javascript
function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }
  
  // 返回下一个工作单元 (子节点 -> 兄弟节点 -> 父节点的兄弟)
  if (fiber.child) return fiber.child;
  
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) return nextFiber.sibling;
    nextFiber = nextFiber.parent;
  }
}
```

### 4. 协调算法 (Reconciliation)

[`reconcileChildren`](tiny-react/render.js) 函数比较新旧 Fiber 树,决定如何更新 DOM:

```javascript
function reconcileChildren(wipFiber, elements) {
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  
  elements.forEach((element, index) => {
    const sameType = oldFiber && element && element.type === oldFiber.type;
    
    if (sameType) {
      // 更新: 复用 DOM,更新属性
      newFiber.effectTag = "UPDATE";
    } else if (element) {
      // 新增: 创建新 DOM
      newFiber.effectTag = "PLACEMENT";
    } else if (oldFiber) {
      // 删除: 移除旧 DOM
      oldFiber.effectTag = "DELETION";
    }
  });
}
```

**Diff 策略:**
- 类型相同 → 复用 DOM,更新属性
- 类型不同 → 删除旧节点,创建新节点
- 只删除 → 标记删除

### 5. 提交阶段 (Commit Phase)

[`commitRoot`](tiny-react/render.js) 将变更一次性应用到真实 DOM:

```javascript
function commitWork(fiber) {
  const domParent = fiber.parent.dom;
  
  if (fiber.effectTag === "PLACEMENT") {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE") {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    domParent.removeChild(fiber.dom);
  }
  
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}
```

### 6. Hooks - useState

实现了 [`useState`](tiny-react/render.js) Hook,支持函数组件的状态管理:

```javascript
export function useState(initial) {
  const oldHook = wipFiber.alternate?.hooks?.[hookIndex];
  
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };
  
  // 执行队列中的所有更新
  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });
  
  const setState = (action) => {
    hook.queue.push(action);
    // 触发重新渲染
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
  };
  
  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}
```

**特点:**
- 支持函数式更新: `setState(prev => prev + 1)`
- 使用队列批量处理更新
- 通过 `hookIndex` 保证 Hooks 调用顺序

### 7. 事件处理和属性更新

[`updateDom`](tiny-react/render.js) 函数处理属性和事件的更新:

```javascript
function updateDom(dom, prevProps, nextProps) {
  // 1. 移除旧事件
  Object.keys(prevProps)
    .filter(isEvent)
    .filter(key => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach(key => {
      const eventType = key.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[key]);
    });
  
  // 2. 添加新事件
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach(key => {
      const eventType = key.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[key]);
    });
  
  // 3. 更新属性
  // ...
}
```

## 使用示例

查看 [src/main.js](src/main.js) 中的完整示例:

```javascript
import { createElement, render, useState } from "../tiny-react";

const Counter = () => {
  const [count, setCount] = useState(0);

  return createElement(
    "div",
    null,
    createElement("h1", null, count),
    createElement("button", { onclick: () => setCount((c) => c + 1) }, "+1")
  );
};

const element = createElement(Counter);
const container = document.getElementById("root");
render(element, container);
```

## 运行项目

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 核心概念对比

| 概念 | Tiny React | React |
|------|-----------|-------|
| 虚拟 DOM | ✅ | ✅ |
| Fiber 架构 | ✅ | ✅ |
| 协调算法 | 简化版 | 完整版 |
| Hooks | useState | useState, useEffect, etc. |
| 并发模式 | requestIdleCallback | Scheduler |
| JSX | 手动 createElement | Babel 转换 |

## 技术要点

1. **可中断渲染**: 使用 `requestIdleCallback` 实现时间切片
2. **双缓冲技术**: `currentRoot` 和 `wipRoot` 交替工作
3. **Fiber 树遍历**: 深度优先遍历 (子 → 兄弟 → 父)
4. **批量更新**: commit 阶段一次性应用所有变更
5. **Hooks 状态管理**: 通过 Fiber 节点存储 hooks 数组

## 局限性

- 不支持 JSX (需要手动调用 createElement)
- 只实现了 useState Hook
- 没有实现 key 属性的优化
- 事件系统简化,未实现事件委托
- 没有错误边界处理


参考：
- [build-your-own-react](https://pomb.us/build-your-own-react/)
- [视频](bilibili.com/video/BV1HP411j7yk/?spm_id_from=333.999.0.0)
