import { createElement, render } from "../tiny-react";

const App = (props) => {
  return createElement("h1", null, "Hello ", props.name);
};

const element = createElement(App, { name: "Tony" });

const container = document.getElementById("root");

render(element, container);
