import OpenAI from 'openai';

/**
 * 浏览器操作工具 Schema 定义
 * 用于 OpenAI Function Calling
 */

type Tool = OpenAI.Chat.ChatCompletionTool;

export const browserNavigateTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_navigate',
    description: '导航到指定的 URL 地址',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要导航到的 URL 地址，必须是完整的 URL（包含协议）',
        },
      },
      required: ['url'],
    },
  },
};

export const browserClickTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_click',
    description: '点击页面上的元素',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，例如 #submit-btn, .login-button, button[type="submit"]',
        },
        description: {
          type: 'string',
          description: '元素描述，用于日志记录和理解元素用途',
        },
      },
      required: ['selector'],
    },
  },
};

export const browserTypeTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_type',
    description: '在输入框中输入文本',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，指向 input 或 textarea 元素',
        },
        text: {
          type: 'string',
          description: '要输入的文本内容',
        },
        clear: {
          type: 'boolean',
          description: '是否在输入前清空现有内容，默认为 true',
        },
      },
      required: ['selector', 'text'],
    },
  },
};

export const browserSelectTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_select',
    description: '选择下拉框中的选项',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，指向 select 元素',
        },
        value: {
          type: 'string',
          description: '要选择的选项值',
        },
      },
      required: ['selector', 'value'],
    },
  },
};

export const browserHoverTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_hover',
    description: '将鼠标悬停在元素上',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，指向要悬停的元素',
        },
      },
      required: ['selector'],
    },
  },
};

export const browserScrollTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_scroll',
    description: '滚动页面或元素',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，可选。如果提供，则滚动到该元素；否则滚动整个页面',
        },
        x: {
          type: 'number',
          description: '水平滚动距离（像素），可选',
        },
        y: {
          type: 'number',
          description: '垂直滚动距离（像素），可选',
        },
      },
    },
  },
};

export const browserWaitTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_wait',
    description: '等待元素出现或等待指定时间',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，等待该元素出现。与 ms 参数二选一',
        },
        ms: {
          type: 'number',
          description: '等待时间（毫秒）。与 selector 参数二选一',
        },
      },
    },
  },
};

export const browserScreenshotTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_screenshot',
    description: '截取当前页面的屏幕截图',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '截图名称，用于保存文件',
        },
        fullPage: {
          type: 'boolean',
          description: '是否截取整个页面，默认为 false（仅可视区域）',
        },
      },
      required: ['name'],
    },
  },
};

export const browserPressTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_press',
    description: '按下键盘按键',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: '按键名称，例如 Enter, Escape, Tab, ArrowUp, ArrowDown 等',
        },
        selector: {
          type: 'string',
          description: 'CSS 选择器，可选。如果提供，则在指定元素上按键；否则在页面上按键',
        },
      },
      required: ['key'],
    },
  },
};

export const browserEvaluateTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_evaluate',
    description: '在页面中执行 JavaScript 代码（仅限安全的 DOM 操作）',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript 代码，仅允许安全的 DOM 操作（如 window.scrollBy, document.querySelector 等）',
        },
      },
      required: ['script'],
    },
  },
};

export const browserGetTextTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_get_text',
    description: '获取元素的文本内容',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，指向要获取文本的元素',
        },
      },
      required: ['selector'],
    },
  },
};

export const browserGetValueTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_get_value',
    description: '获取输入框的值',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，指向 input 或 textarea 元素',
        },
      },
      required: ['selector'],
    },
  },
};

export const browserGetUrlTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_get_url',
    description: '获取当前页面的 URL',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

export const browserGetTitleTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_get_title',
    description: '获取当前页面的标题',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

export const browserIsVisibleTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_is_visible',
    description: '检查元素是否可见',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，指向要检查的元素',
        },
      },
      required: ['selector'],
    },
  },
};

export const browserGetCountTool: Tool = {
  type: 'function',
  function: {
    name: 'browser_get_count',
    description: '获取匹配选择器的元素数量',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器',
        },
      },
      required: ['selector'],
    },
  },
};

/**
 * 所有浏览器操作工具的集合
 */
export const browserTools: Tool[] = [
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserSelectTool,
  browserHoverTool,
  browserScrollTool,
  browserWaitTool,
  browserScreenshotTool,
  browserPressTool,
  browserEvaluateTool,
  browserGetTextTool,
  browserGetValueTool,
  browserGetUrlTool,
  browserGetTitleTool,
  browserIsVisibleTool,
  browserGetCountTool,
];

/**
 * 工具名称映射
 */
export const browserToolNames = {
  NAVIGATE: 'browser_navigate',
  CLICK: 'browser_click',
  TYPE: 'browser_type',
  SELECT: 'browser_select',
  HOVER: 'browser_hover',
  SCROLL: 'browser_scroll',
  WAIT: 'browser_wait',
  SCREENSHOT: 'browser_screenshot',
  PRESS: 'browser_press',
  EVALUATE: 'browser_evaluate',
  GET_TEXT: 'browser_get_text',
  GET_VALUE: 'browser_get_value',
  GET_URL: 'browser_get_url',
  GET_TITLE: 'browser_get_title',
  IS_VISIBLE: 'browser_is_visible',
  GET_COUNT: 'browser_get_count',
} as const;