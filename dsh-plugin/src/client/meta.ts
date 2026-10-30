/** This package's identity on the host side and the one outbound link the panel carries. */

/** Must equal the loader row id in `cordis.patch.yml` and the `name` in `src/index.ts`. */
export const PACKAGE_NAME = 'dsh-catdogtrace'

/**
 * The tab type's identity in the sidebar's tab system — also the `key` of both keyed seats
 * (`sidebar.right.pane.tab` and `.title`), and the id the registry refuses to see twice.
 */
export const TAB_ID = PACKAGE_NAME

/**
 * The tab's kind. Namespaced on purpose: the registry carries at most one `builtin` and one
 * `extension` per kind and throws on any other collision, so a bare `catdogtrace` is somebody else's
 * to own.
 */
export const TAB_KIND = PACKAGE_NAME

/** The tab chip's text. */
export const TAB_TITLE = '猫狗判定'

/** One line for the sidebar's guide capsule. */
export const TAB_DESCRIPTION = '出三道数字题，贴回模型的回答，看它最像哪个犬猫品种'

/** Guide capsule position: after the host's own Files entry (order 10). */
export const GUIDE_ORDER = 20

/** The keyed seat that renders this type's body. */
export const PANE_TAB_SLOT = 'sidebar.right.pane.tab'

/** The keyed seat that renders this type's chip. */
export const PANE_TAB_TITLE_SLOT = 'sidebar.right.pane.tab.title'

/** The `/` trigger word: `/catdog`. */
export const COMMAND_NAME = 'catdog'

/** `data-plugin-css` value of the injected stylesheet (the loader uses it to attribute and evict styles). */
export const STYLE_TAG_ID = `${PACKAGE_NAME}/panel.css`

/** The repository this plugin is a shell over. */
export const REPO_URL = 'https://github.com/xiebaiyuan/CatDogTrace'

/** The "what this cannot prove" section the disclaimer points at. */
export const GLOSSARY_URL = `${REPO_URL}/blob/main/GLOSSARY.md`
