import { createElement, render } from "../tiny-react";

const handleInput = (e) => {
  renderer(e.target.value);
};

const renderer = (value) => {
  const element = createElement(
    "div",
    null,
    createElement("input", { oninput: (e) => handleInput(e) }, null),
    createElement("h1", { style: "color: pink;" }, value)
  );
  const root = document.querySelector("#root");
  render(element, root);
};

renderer("");
