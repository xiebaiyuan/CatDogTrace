/** This package's identity on the host side and the one outbound link the overlay carries. */

/** Must equal the loader row id in `cordis.patch.yml` and the `name` in `src/index.ts`. */
export const PACKAGE_NAME = 'dsh-catdogtrace'

/** The composer overlay slot every `dsh.client` bundle uses to put a dialog above the input box. */
export const OVERLAY_SLOT = 'conversation.input.overlay'

/** Registration id inside that slot; also the key the duplicate-mount guard reads. */
export const OVERLAY_ID = 'catdogtrace-modal'

/** The `/` trigger word: `/catdog`. */
export const COMMAND_NAME = 'catdog'

/** `data-plugin-css` value of the injected stylesheet (the loader uses it to attribute and evict styles). */
export const STYLE_TAG_ID = `${PACKAGE_NAME}/overlay.css`

/** The repository this plugin is a shell over. */
export const REPO_URL = 'https://github.com/xiebaiyuan/DogCatTrace'

/** The "what this cannot prove" section the disclaimer points at. */
export const GLOSSARY_URL = `${REPO_URL}/blob/main/GLOSSARY.md`
