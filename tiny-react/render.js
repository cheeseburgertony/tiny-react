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

  // 递归渲染子元素
  element.props.children.forEach((child) => render(child, dom));

  // 将创建的DOM元素添加到容器（父元素）中
  container.appendChild(dom);
}

export default render;
