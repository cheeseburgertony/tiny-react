import { createElement } from "../tiny-react";

const element = createElement(
  "h1",
  { id: "title", className: "hello" },
  "Hello, Tiny React!",
  createElement("div", null, "This is a div inside h1")
);

console.log(element);
