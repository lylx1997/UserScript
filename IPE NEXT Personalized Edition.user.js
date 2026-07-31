// ==UserScript==
// @name         IPE NEXT 个人定制版
// @namespace    https://github.com/lylx1997
// @version      0.2.2
// @description  动态加载 InPageEdit NEXT，集成位置记忆、双击归位、防抖及样式优化。
// @author       乐与乐寻
// @match        https://wiki.biligame.com/*
// @grant        GM_registerMenuCommand
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'ipe-toolbox-position';

    // ========== 沙箱层：仅负责菜单注册与跨上下文通信 ==========
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('🔄 工具箱一键归位', () => {
            localStorage.removeItem(STORAGE_KEY);
            window.postMessage({ type: 'IPE_RESET_POSITION' }, '*');
        });
    }

    // ========== 页面上下文层：所有 DOM/CSS/RLQ 操作在此执行 ==========
    const pageScript = document.createElement('script');
    pageScript.textContent = `(function() {
        'use strict';

        var STORAGE_KEY = '${STORAGE_KEY}';

        window.RLQ = window.RLQ || [];
        window.RLQ.push(function() {
            // 1. 注入自定义 CSS
            var customCSS = [
                '.oo-ui-window-frame { max-height: 400px !important; }',
                '.oo-ui-window-content { height: 400px; }',
                '#ipe-edit-toolbox { will-change: transform; }',
                '#ipe-edit-toolbox.is-resetting { transition: transform 0.2s ease-out; }',
                '#ipe-edit-toolbox #toolbox-toggler {',
                '    opacity: 0.3; transition: opacity 0.3s ease; z-index: 10; cursor: default;',
                '}',
                '#ipe-edit-toolbox #toolbox-toggler:hover,',
                '#ipe-edit-toolbox.is-persistent #toolbox-toggler,',
                '#ipe-edit-toolbox .btn-group:hover ~ #toolbox-toggler { opacity: 1; }',
                "#ipe-edit-toolbox #toolbox-toggler::before {",
                "    content: ''; position: absolute;",
                "    top: -10px; left: -6px; right: 0; bottom: 0;",
                "    clip-path: polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 12px 0%, 12px calc(100% - 41px), 0% calc(100% - 41px), 0% 0%);",
                "}"
            ].join('\\n');
            var styleTag = document.createElement('style');
            styleTag.textContent = customCSS;
            document.head.appendChild(styleTag);

            // 2. 特殊页面样式
            var targetPaths = ['/ys', '/zzz'];
            var currentPath = window.location.pathname;
            if (targetPaths.some(function(p) { return currentPath.startsWith(p); })) {
                var s = document.createElement('style');
                s.textContent = 'a:focus:not(:focus-visible) { outline-style: none; }';
                document.head.appendChild(s);
            }

            // 3. 加载 InPageEdit 核心模块
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@inpageedit/core/dist/index.js';
            script.type = 'module';
            document.head.appendChild(script);

            // 4. 图标拖拽 + 记忆 + 归位
            var observer = new MutationObserver(function() {
                var toolbox = document.getElementById('ipe-edit-toolbox');
                var handle = document.getElementById('toolbox-toggler');
                if (toolbox && handle && !handle.dataset.dragInit) {
                    handle.dataset.dragInit = 'true';
                    initSafeDrag(toolbox, handle);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            function initSafeDrag(targetElement, dragHandle) {
                var isDragging = false, hasMoved = false;
                var startX, startY, rafId = null;
                var currentTranslateX = 0, currentTranslateY = 0;
                var DRAG_THRESHOLD = 3;

                // 读取保存的位置
                var savedPos = localStorage.getItem(STORAGE_KEY);
                if (savedPos) {
                    try {
                        var pos = JSON.parse(savedPos);
                        currentTranslateX = pos.x;
                        currentTranslateY = pos.y;
                        targetElement.style.transform = 'translate(' + currentTranslateX + 'px,' + currentTranslateY + 'px)';
                    } catch (e) { console.error('IPE位置读取失败', e); }
                }

                // 归位执行函数（双击 & 菜单共用）
                function doReset() {
                    targetElement.classList.add('is-resetting');
                    currentTranslateX = 0;
                    currentTranslateY = 0;
                    targetElement.style.transform = 'translate(0px,0px)';
                    localStorage.removeItem(STORAGE_KEY);
                    setTimeout(function() { targetElement.classList.remove('is-resetting'); }, 250);
                }

                // 监听来自沙箱层的菜单归位指令
                window.addEventListener('message', function(e) {
                    if (e.data && e.data.type === 'IPE_RESET_POSITION') {
                        doReset();
                    }
                });

                // 双击手柄归位
                dragHandle.addEventListener('dblclick', function(e) {
                    e.preventDefault(); e.stopPropagation();
                    doReset();
                });

                // 拖拽开始
                dragHandle.addEventListener('mousedown', function(e) {
                    if (e.button !== 0) return;
                    isDragging = true; hasMoved = false;
                    startX = e.clientX - currentTranslateX;
                    startY = e.clientY - currentTranslateY;
                    targetElement.classList.remove('is-resetting');
                    e.preventDefault();
                });

                // 拖拽中
                var onMouseMove = function(e) {
                    if (!isDragging) return;
                    var dx = e.clientX - startX, dy = e.clientY - startY;
                    if (!hasMoved && Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) {
                        hasMoved = true;
                        targetElement.style.pointerEvents = 'none';
                    }
                    if (hasMoved) {
                        e.preventDefault();
                        currentTranslateX = dx; currentTranslateY = dy;
                        if (rafId) cancelAnimationFrame(rafId);
                        rafId = requestAnimationFrame(function() {
                            targetElement.style.transform = 'translate(' + currentTranslateX + 'px,' + currentTranslateY + 'px)';
                        });
                    }
                };

                // 拖拽结束
                var onMouseUp = function() {
                    if (isDragging) {
                        if (hasMoved) {
                            targetElement.style.pointerEvents = '';
                            localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: currentTranslateX, y: currentTranslateY }));
                        }
                        isDragging = false;
                        if (rafId) cancelAnimationFrame(rafId);
                    }
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            }
        });
    })();`;

    document.documentElement.appendChild(pageScript);
    pageScript.remove(); // 注入后立即移除标签，保持 DOM 干净
})();
