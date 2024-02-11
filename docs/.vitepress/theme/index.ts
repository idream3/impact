import DefaultTheme from "vitepress/theme";
import Playground from "./Playground.vue";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("playground", Playground);
  },
};
