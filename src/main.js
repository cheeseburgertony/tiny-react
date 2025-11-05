import { createElement, render } from "../tiny-react";

const element = createElement(
  "h1",
  { id: "title", className: "hello", style: "color: skyblue;" },
  "Hello, Tiny React!",
  createElement("div", { style: "color: pink;" }, "This is a div inside h1")
);

const root = document.querySelector("#root");
render(element, root);

console.log(element);
