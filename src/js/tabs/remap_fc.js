import { mount, unmount } from "svelte";

import { GUI } from "@/js/gui.js";
import RemapFc from "@/tabs/remap_fc/RemapFc.svelte";

import { TABS } from "./tabs.js";

const tab = {
  tabName: "remap_fc",
  svelteComponent: null,

  get isDirty() {
    return this.svelteComponent?.isDirty();
  },

  initialize(callback) {
    const target = document.querySelector("#content");
    target.innerHTML = "";
    this.svelteComponent = mount(RemapFc, { target });

    GUI.content_ready(callback);
  },

  cleanup(callback) {
    if (this.svelteComponent) {
      unmount(this.svelteComponent);
      this.svelteComponent = null;
    }

    callback?.();
  },
};

TABS[tab.tabName] = tab;

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule && GUI.active_tab === tab.tabName) {
      TABS[tab.tabName].initialize();
    }
  });

  import.meta.hot.dispose(() => {
    tab.cleanup();
  });
}
