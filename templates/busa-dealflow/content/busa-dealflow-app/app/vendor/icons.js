// node_modules/lucide/dist/esm/defaultAttributes.mjs
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};

// node_modules/lucide/dist/esm/createElement.mjs
var createSVGElement = ([tag, attrs, children]) => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs).forEach((name) => {
    element.setAttribute(name, String(attrs[name]));
  });
  if (children?.length) {
    children.forEach((child) => {
      const childElement = createSVGElement(child);
      element.appendChild(childElement);
    });
  }
  return element;
};
var createElement = (iconNode, customAttrs = {}) => {
  const tag = "svg";
  const attrs = {
    ...defaultAttributes,
    ...customAttrs
  };
  return createSVGElement([tag, attrs, iconNode]);
};

// node_modules/lucide/dist/esm/shared/src/utils/mergeClasses.mjs
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// node_modules/lucide/dist/esm/shared/src/utils/hasA11yProp.mjs
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};

// node_modules/lucide/dist/esm/shared/src/utils/toCamelCase.mjs
var toCamelCase = (string) => {
  let out = "";
  let upperNext = false;
  for (const ch of string) {
    if (ch === "-" || ch === "_" || ch <= " ") {
      upperNext = out.length > 0;
      continue;
    }
    if (out.length === 0) {
      out += ch.toLowerCase();
    } else {
      out += upperNext ? ch.toUpperCase() : ch;
    }
    upperNext = false;
  }
  return out;
};

// node_modules/lucide/dist/esm/shared/src/utils/toPascalCase.mjs
var toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};

// node_modules/lucide/dist/esm/replaceElement.mjs
var getAttrs = (element) => Array.from(element.attributes).reduce((attrs, attr) => {
  attrs[attr.name] = attr.value;
  return attrs;
}, {});
var getClassNames = (attrs) => {
  if (typeof attrs === "string") return attrs;
  if (!attrs || !attrs.class) return "";
  if (attrs.class && typeof attrs.class === "string") {
    return attrs.class.split(" ");
  }
  if (attrs.class && Array.isArray(attrs.class)) {
    return attrs.class;
  }
  return "";
};
var replaceElement = (element, { nameAttr, icons, attrs }) => {
  const iconName = element.getAttribute(nameAttr);
  if (iconName == null) return;
  const ComponentName = toPascalCase(iconName);
  const iconNode = icons[ComponentName];
  if (!iconNode) {
    return console.warn(
      `${element.outerHTML} icon name was not found in the provided icons object.`
    );
  }
  const elementAttrs = getAttrs(element);
  const ariaProps = hasA11yProp(elementAttrs) ? {} : { "aria-hidden": "true" };
  const iconAttrs = {
    ...defaultAttributes,
    "data-lucide": iconName,
    ...ariaProps,
    ...attrs,
    ...elementAttrs
  };
  const elementClassNames = getClassNames(elementAttrs);
  const className = getClassNames(attrs);
  const classNames = mergeClasses(
    "lucide",
    `lucide-${iconName}`,
    ...elementClassNames,
    ...className
  );
  if (classNames) {
    Object.assign(iconAttrs, {
      class: classNames
    });
  }
  const svgElement = createElement(iconNode, iconAttrs);
  return element.parentNode?.replaceChild(svgElement, element);
};

// node_modules/lucide/dist/esm/icons/briefcase-business.mjs
var BriefcaseBusiness = [
  ["path", { d: "M12 12h.01" }],
  ["path", { d: "M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" }],
  ["path", { d: "M22 13a18.15 18.15 0 0 1-20 0" }],
  ["rect", { width: "20", height: "14", x: "2", y: "6", rx: "2" }]
];

// node_modules/lucide/dist/esm/icons/check.mjs
var Check = [["path", { d: "M20 6 9 17l-5-5" }]];

// node_modules/lucide/dist/esm/icons/chevron-left.mjs
var ChevronLeft = [["path", { d: "m15 18-6-6 6-6" }]];

// node_modules/lucide/dist/esm/icons/chevron-right.mjs
var ChevronRight = [["path", { d: "m9 18 6-6-6-6" }]];

// node_modules/lucide/dist/esm/icons/copy.mjs
var Copy = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]
];

// node_modules/lucide/dist/esm/icons/external-link.mjs
var ExternalLink = [
  ["path", { d: "M15 3h6v6" }],
  ["path", { d: "M10 14 21 3" }],
  ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]
];

// node_modules/lucide/dist/esm/icons/file-text.mjs
var FileText = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }],
  ["path", { d: "M10 9H8" }],
  ["path", { d: "M16 13H8" }],
  ["path", { d: "M16 17H8" }]
];

// node_modules/lucide/dist/esm/icons/layout-dashboard.mjs
var LayoutDashboard = [
  ["rect", { width: "7", height: "9", x: "3", y: "3", rx: "1" }],
  ["rect", { width: "7", height: "5", x: "14", y: "3", rx: "1" }],
  ["rect", { width: "7", height: "9", x: "14", y: "12", rx: "1" }],
  ["rect", { width: "7", height: "5", x: "3", y: "16", rx: "1" }]
];

// node_modules/lucide/dist/esm/icons/list-checks.mjs
var ListChecks = [
  ["path", { d: "M13 5h8" }],
  ["path", { d: "M13 12h8" }],
  ["path", { d: "M13 19h8" }],
  ["path", { d: "m3 17 2 2 4-4" }],
  ["path", { d: "m3 7 2 2 4-4" }]
];

// node_modules/lucide/dist/esm/icons/lock-keyhole.mjs
var LockKeyhole = [
  ["circle", { cx: "12", cy: "16", r: "1" }],
  ["rect", { x: "3", y: "10", width: "18", height: "12", rx: "2" }],
  ["path", { d: "M7 10V7a5 5 0 0 1 10 0v3" }]
];

// node_modules/lucide/dist/esm/icons/menu.mjs
var Menu = [
  ["path", { d: "M4 5h16" }],
  ["path", { d: "M4 12h16" }],
  ["path", { d: "M4 19h16" }]
];

// node_modules/lucide/dist/esm/icons/messages-square.mjs
var MessagesSquare = [
  [
    "path",
    {
      d: "M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
    }
  ],
  [
    "path",
    {
      d: "M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"
    }
  ]
];

// node_modules/lucide/dist/esm/icons/panel-left-close.mjs
var PanelLeftClose = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
  ["path", { d: "M9 3v18" }],
  ["path", { d: "m16 15-3-3 3-3" }]
];

// node_modules/lucide/dist/esm/icons/plug-zap.mjs
var PlugZap = [
  ["path", { d: "M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" }],
  ["path", { d: "m2 22 3-3" }],
  ["path", { d: "M7.5 13.5 10 11" }],
  ["path", { d: "M10.5 16.5 13 14" }],
  ["path", { d: "m18 3-4 4h6l-4 4" }]
];

// node_modules/lucide/dist/esm/icons/refresh-cw.mjs
var RefreshCw = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }],
  ["path", { d: "M21 3v5h-5" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }],
  ["path", { d: "M8 16H3v5" }]
];

// node_modules/lucide/dist/esm/icons/x.mjs
var X = [
  ["path", { d: "M18 6 6 18" }],
  ["path", { d: "m6 6 12 12" }]
];

// node_modules/lucide/dist/esm/lucide.mjs
var createIcons = ({
  icons = {},
  nameAttr = "data-lucide",
  attrs = {},
  root = document,
  inTemplates
} = {}) => {
  if (!Object.values(icons).length) {
    throw new Error(
      "Please provide an icons object.\nIf you want to use all the icons you can import it like:\n `import { createIcons, icons } from 'lucide';\nlucide.createIcons({icons});`"
    );
  }
  if (typeof root === "undefined") {
    throw new Error("`createIcons()` only works in a browser environment.");
  }
  const elementsToReplace = Array.from(root.querySelectorAll(`[${nameAttr}]`));
  elementsToReplace.forEach((element) => replaceElement(element, { nameAttr, icons, attrs }));
  if (inTemplates) {
    const templates = Array.from(root.querySelectorAll("template"));
    templates.forEach(
      (template) => createIcons({
        icons,
        nameAttr,
        attrs,
        root: template.content,
        inTemplates
      })
    );
  }
  if (nameAttr === "data-lucide") {
    const deprecatedElements = root.querySelectorAll("[icon-name]");
    if (deprecatedElements.length > 0) {
      console.warn(
        "[Lucide] Some icons were found with the now deprecated icon-name attribute. These will still be replaced for backwards compatibility, but will no longer be supported in v1.0 and you should switch to data-lucide"
      );
      Array.from(deprecatedElements).forEach(
        (element) => replaceElement(element, { nameAttr: "icon-name", icons, attrs })
      );
    }
  }
};

// app/js/icons.js
function renderIcons() {
  createIcons({ icons: { Menu, PanelLeftClose, RefreshCw, X, LayoutDashboard, BriefcaseBusiness, MessagesSquare, ListChecks, FileText, LockKeyhole, PlugZap, ChevronLeft, ChevronRight, Copy, Check, ExternalLink } });
}
export {
  renderIcons
};
/*! Bundled license information:

lucide/dist/esm/defaultAttributes.mjs:
lucide/dist/esm/createElement.mjs:
lucide/dist/esm/shared/src/utils/mergeClasses.mjs:
lucide/dist/esm/shared/src/utils/hasA11yProp.mjs:
lucide/dist/esm/shared/src/utils/toCamelCase.mjs:
lucide/dist/esm/shared/src/utils/toPascalCase.mjs:
lucide/dist/esm/replaceElement.mjs:
lucide/dist/esm/icons/briefcase-business.mjs:
lucide/dist/esm/icons/check.mjs:
lucide/dist/esm/icons/chevron-left.mjs:
lucide/dist/esm/icons/chevron-right.mjs:
lucide/dist/esm/icons/copy.mjs:
lucide/dist/esm/icons/external-link.mjs:
lucide/dist/esm/icons/file-text.mjs:
lucide/dist/esm/icons/layout-dashboard.mjs:
lucide/dist/esm/icons/list-checks.mjs:
lucide/dist/esm/icons/lock-keyhole.mjs:
lucide/dist/esm/icons/menu.mjs:
lucide/dist/esm/icons/messages-square.mjs:
lucide/dist/esm/icons/panel-left-close.mjs:
lucide/dist/esm/icons/plug-zap.mjs:
lucide/dist/esm/icons/refresh-cw.mjs:
lucide/dist/esm/icons/x.mjs:
lucide/dist/esm/lucide.mjs:
  (**
   * @license lucide v1.60.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
