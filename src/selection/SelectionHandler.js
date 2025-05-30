import {
  trimRange,
  rangeToSelection,
  enableTouch,
  getExactOverlaps,
} from "./SelectionUtils";
import EventEmitter from "tiny-emitter";


// 检测是否为触摸设备
const IS_TOUCH = "ontouchstart" in window || navigator.maxTouchPoints > 0;

// 检测是否为IE浏览器
const IS_INTERNET_EXPLORER = navigator?.userAgent.match(/(MSIE|Trident)/);

/** 测试maybeChildEl是否包含在containerEl中 **/
const contains = (containerEl, maybeChildEl) => {
  if (IS_INTERNET_EXPLORER) {
    // 在IE中，.contains对文本节点返回false
    // https://stackoverflow.com/questions/44140712/ie-acting-strange-with-node-contains-and-text-nodes
    if (maybeChildEl.nodeType == Node.TEXT_NODE)
      return (
        containerEl === maybeChildEl.parentNode ||
        containerEl.contains(maybeChildEl.parentNode)
      );
    else return containerEl.contains(maybeChildEl);
  } else {
    // 非IE浏览器可以直接使用contains方法
    return containerEl.contains(maybeChildEl);
  }
};

export default class SelectionHandler extends EventEmitter {
  constructor(element, highlighter, readOnly) {
    super();

    this.el = element; // 目标元素
    this.highlighter = highlighter; // 高亮处理器
    this.readOnly = readOnly; // 是否只读模式

    this.isEnabled = true; // 是否启用选择功能

    this.document = element.ownerDocument;

    // 绑定鼠标事件
    element.addEventListener("mousedown", this._onMouseDown);
    element.addEventListener("mouseup", this._onMouseUp);

    // 如果是触摸设备，启用触摸支持
    if (IS_TOUCH) enableTouch(element, this._onMouseUp);
  }

  // 获取启用状态
  get enabled() {
    return this.isEnabled;
  }

  // 设置启用状态
  set enabled(enabled) {
    this.isEnabled = enabled;
  }

  // 鼠标按下事件处理
  _onMouseDown = (evt) => {
    // 仅处理左键点击
    if (evt.button === 0) this.clearSelection();
  };

  // 鼠标释放事件处理 - 关键的状态修改函数
  _onMouseUp = (evt) => {
   
    if (this.isEnabled) {
      const selection = this.document.getSelection();

      if (selection.isCollapsed) {
        // 处理点击已有标注的情况
        const annotationSpan = evt.target.closest(".r6o-annotation");
        if (annotationSpan) {
          // 触发选择事件，返回选中的标注
          this.emit("select", {
            selection: this.highlighter.getAnnotationsAt(annotationSpan)[0],
            element: annotationSpan,
          });
        } else {
          // 取消选择
          this.emit("select", {});
        }
      } else if (!this.readOnly) {
        // 处理新选择的情况
        const selectedRange = trimRange(selection.getRangeAt(0));

        // 确保选择范围在目标元素内
        const { commonAncestorContainer } = selectedRange;

        if (contains(this.el, commonAncestorContainer)) {
          const stub = rangeToSelection(selectedRange, this.el);

          // 创建高亮span元素
          const spans = this.highlighter.wrapRange(selectedRange);
          spans.forEach((span) => (span.className = "r6o-selection"));

          this._hideNativeSelection();

    // 检查是否有完全重叠的标注
          const exactOverlaps = getExactOverlaps(stub, spans);
          if (exactOverlaps.length > 0) {
            // 用户选择了已存在的标注 - 重用最上层的原始标注以避免分层
            const top = exactOverlaps[0];

            this.clearSelection();
            this.emit("select", {
              selection: top,
              element: this.document.querySelector(
                `.r6o-annotation[data-id="${top.id}"]`
              ),
            });
          } else {
            // 创建新的选择
            this.emit("select", {
              selection: stub,
              element: selectedRange,
            });
          }
        }
      }
    }
  };

  // 隐藏原生选择
  _hideNativeSelection = () => {
    this.el.classList.add("r6o-hide-selection");
  };

  // 清除选择 - 关键的状态重置函数
  clearSelection = () => {
    if (this.isEnabled) {
      this._currentSelection = null;

      // 移除原生选择
      if (this.document.getSelection) {
        if (this.document.getSelection().empty) {
          // Chrome
          this.document.getSelection().empty();
        } else if (this.document.getSelection().removeAllRanges) {
          // Firefox
          this.document.getSelection().removeAllRanges();
        }
      } else if (this.document.selection) {
        // IE
        this.document.selection.empty();
      }

      this.el.classList.remove("r6o-hide-selection");

      // 移除所有选择span元素
      const spans = Array.prototype.slice.call(
        this.el.querySelectorAll(".r6o-selection")
      );
      if (spans) {
        spans.forEach((span) => {
          const parent = span.parentNode;
          parent.insertBefore(
            this.document.createTextNode(span.textContent),
            span
          );
          parent.removeChild(span);
        });
      }
      this.el.normalize();
    }
  };
}
