<script>
  /**
   * File: src/tabs/remap_fc/RemapFc.svelte
   * UI for the "Remap FC" tab. Phase 1 is a styled placeholder only —
   * the CLI read flow, the current-vs-default remap table and the
   * timer/DMA allocation logic are added in later phases.
   */
  import Page from "@/components/Page.svelte";

  import { getTabHelpURL } from "@/js/help.js";
  import { i18n } from "@/js/i18n.js";

  function onClickHelp() {
    window.open(getTabHelpURL("tabRemapFC"), "_system");
  }

  export function isDirty() {
    return false;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabRemapFC")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

<Page {header} loading={false}>
  <p class="placeholder">{$i18n.t("remapFcPlaceholder")}</p>
</Page>

<style lang="scss">
  .btn {
    @extend %button;
  }

  .help-btn {
    padding: 4px 8px;
    min-width: 60px;
  }

  .grow {
    flex-grow: 1;
  }

  .placeholder {
    margin-top: 20px;
    color: var(--color-text);
  }
</style>
