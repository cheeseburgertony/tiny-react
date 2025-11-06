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
