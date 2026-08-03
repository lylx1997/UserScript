// ==UserScript==
// @name         IPE NEXT 个人定制版
// @namespace    https://github.com/lylx1997
// @version      0.2.6
// @description  动态加载 InPageEdit NEXT，集成位置记忆、双击归位、防抖及样式优化，实现跨浏览器的悬浮、自动隐藏滚动条。
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
                '/* 隐藏原生滚动条但保留滚动功能 */',
                'html {',
                '    scrollbar-width: none; /* Firefox */',
                '    -ms-overflow-style: none; /* IE/Edge */',
                '}',
                'html::-webkit-scrollbar { display: none; } /* Chrome/Edge/Safari */',

                '/* 自定义悬浮滚动条样式 */',
                '#custom-fake-scrollbar, #custom-fake-scrollbar-h {',
                '    position: fixed;',
                '    z-index: 99999;',
                '    pointer-events: none;', /* 默认不阻挡页面点击 */
                '    opacity: 0;',
                '    transition: opacity 0.3s ease;',
                '}',
                '#custom-fake-scrollbar.visible, #custom-fake-scrollbar-h.visible {',
                '    opacity: 1;',
                '    pointer-events: auto;', /* 显示时允许拖拽 */
                '}',
                '#custom-fake-scrollbar { top: 0; right: 0; width: 8px; height: 100vh; }',
                '#custom-fake-scrollbar-h { bottom: -7px; left: 0; height: 8px; width: 100vw; }',

                '#custom-fake-scrollbar .thumb, #custom-fake-scrollbar-h .thumb {',
                '    position: absolute;',
                '    background-color: rgba(120, 120, 120, 0.6);',
                '    border-radius: 4px;',
                '    cursor: pointer;',
                '    transition: background-color 0.2s;',
                '}',
                '#custom-fake-scrollbar .thumb:hover, #custom-fake-scrollbar-h .thumb:hover {',
                '    background-color: rgba(120, 120, 120, 0.9);',
                '}',
                '#custom-fake-scrollbar .thumb { right: 0; width: 8px; }',
                '#custom-fake-scrollbar-h .thumb { bottom: 0; height: 8px; }',

                '/* 快速编辑设置修正 */',
                '.oo-ui-window-frame { max-height: 400px !important; }',
                '.oo-ui-window-content { height: 400px; }',

                '/* 隐藏个人不需要的侧边工具 */',
                '.bui-sns-info { display: none; }',

                '/* 工具图标CSS定制 */',
                '#ipe-edit-toolbox { will-change: transform; }',
                '#ipe-edit-toolbox.is-resetting { transition: transform 0.2s ease-out; }',
                '#ipe-edit-toolbox #toolbox-toggler {',
                '    opacity: 0.3; transition: opacity 0.3s ease; z-index: 10; cursor: default;',
                '}',
                '#ipe-edit-toolbox #toolbox-toggler:hover,',
                '#ipe-edit-toolbox.is-persistent #toolbox-toggler,',
                '#ipe-edit-toolbox .btn-group:hover ~ #toolbox-toggler { opacity: 1; }',
                '#ipe-edit-toolbox.is-persistent #toolbox-toggler::before { transform: rotate(-45deg); transform-origin: 30px 34px; }',
                "#ipe-edit-toolbox #toolbox-toggler::before {",
                "    content: ''; position: absolute;",
                "    top: -10px; left: -6px; right: 0; bottom: 0;",
                "    clip-path: polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 12px 0%, 12px calc(100% - 41px), 0% calc(100% - 41px), 0% 0%);",
                "    background: 0;",
                "}"
            ].join('\\n');
            var styleTag = document.createElement('style');
            styleTag.textContent = customCSS;
            document.head.appendChild(styleTag);

            // 2. 初始化假滚动条 DOM 与逻辑
            var EDGE_THRESHOLD = 40; // 鼠标靠近边缘的触发距离（像素）
            var hideTimer = null;
            var isDraggingV = false; // 垂直拖拽状态
            var isDraggingH = false; // 水平拖拽状态

            // 创建垂直滚动条
            var fakeScrollbarV = document.createElement('div');
            fakeScrollbarV.id = 'custom-fake-scrollbar';
            fakeScrollbarV.innerHTML = '<div class="thumb"></div>';
            document.body.appendChild(fakeScrollbarV);
            var thumbV = fakeScrollbarV.querySelector('.thumb');

            // 创建水平滚动条
            var fakeScrollbarH = document.createElement('div');
            fakeScrollbarH.id = 'custom-fake-scrollbar-h';
            fakeScrollbarH.innerHTML = '<div class="thumb"></div>';
            document.body.appendChild(fakeScrollbarH);
            var thumbH = fakeScrollbarH.querySelector('.thumb');

            // 统一显示滚动条函数
            function showScrollbars() {
                fakeScrollbarV.classList.add('visible');
                fakeScrollbarH.classList.add('visible');
                updateThumbVPosition();
                updateThumbHPosition();

                if (hideTimer) clearTimeout(hideTimer);
                hideTimer = setTimeout(function() {
                    // 如果不在拖拽状态，则隐藏
                    if (!isDraggingV && !isDraggingH) {
                        fakeScrollbarV.classList.remove('visible');
                        fakeScrollbarH.classList.remove('visible');
                    }
                }, 800);
            }

            // 更新垂直滑块位置
            function updateThumbVPosition() {
                var docHeight = document.documentElement.scrollHeight;
                var winHeight = window.innerHeight;
                var scrollTop = window.scrollY || document.documentElement.scrollTop;

                if (docHeight <= winHeight) {
                    thumbV.style.height = '0px';
                    return;
                }
                var thumbHeight = Math.max(30, (winHeight / docHeight) * winHeight);
                var thumbTop = (scrollTop / (docHeight - winHeight)) * (winHeight - thumbHeight);
                thumbV.style.height = thumbHeight + 'px';
                thumbV.style.transform = 'translateY(' + thumbTop + 'px)';
            }

            // 更新水平滑块位置
            function updateThumbHPosition() {
                var docWidth = document.documentElement.scrollWidth;
                var winWidth = window.innerWidth;
                var scrollLeft = window.scrollX || document.documentElement.scrollLeft;

                if (docWidth <= winWidth) {
                    thumbH.style.width = '0px';
                    return;
                }
                var thumbWidth = Math.max(30, (winWidth / docWidth) * winWidth);
                var thumbLeft = (scrollLeft / (docWidth - winWidth)) * (winWidth - thumbWidth);
                thumbH.style.width = thumbWidth + 'px';
                thumbH.style.transform = 'translateX(' + thumbLeft + 'px)';
            }

            // 监听滚动与窗口大小变化
            window.addEventListener('scroll', showScrollbars, { passive: true });
            window.addEventListener('resize', function() {
                updateThumbVPosition();
                updateThumbHPosition();
            });

            // 监听鼠标移动，仅在靠近边缘时显示
            window.addEventListener('mousemove', function(e) {
                var winWidth = window.innerWidth;
                var winHeight = window.innerHeight;

                var isNearRightEdge = e.clientX >= winWidth - EDGE_THRESHOLD;
                var isNearBottomEdge = e.clientY >= winHeight - EDGE_THRESHOLD;

                if (isNearRightEdge || isNearBottomEdge) {
                    showScrollbars();
                } else {
                    // 如果鼠标不在边缘，且当前没有在拖拽任何一个滚动条，才执行隐藏逻辑
                    if (!isDraggingV && !isDraggingH) {
                        if (hideTimer) {
                            fakeScrollbarV.classList.remove('visible');
                            fakeScrollbarH.classList.remove('visible');
                            clearTimeout(hideTimer);
                            hideTimer = null;
                        }
                    }
                }
            }, { passive: true });

            // 3. 拖拽逻辑
            var dragStartPos = 0;
            var dragScrollStart = 0;

            // 垂直拖拽
            thumbV.addEventListener('mousedown', function(e) {
                isDraggingV = true;
                dragStartPos = e.clientY;
                dragScrollStart = window.scrollY || document.documentElement.scrollTop;
                e.preventDefault();
            });

            // 水平拖拽
            thumbH.addEventListener('mousedown', function(e) {
                isDraggingH = true;
                dragStartPos = e.clientX;
                dragScrollStart = window.scrollX || document.documentElement.scrollLeft;
                e.preventDefault();
            });

            window.addEventListener('mousemove', function(e) {
                var docHeight = document.documentElement.scrollHeight;
                var winHeight = window.innerHeight;
                var docWidth = document.documentElement.scrollWidth;
                var winWidth = window.innerWidth;

                // 处理垂直拖拽
                if (isDraggingV) {
                    var deltaY = e.clientY - dragStartPos;
                    var thumbHeight = thumbV.offsetHeight;
                    var trackHeight = winHeight - thumbHeight;
                    var scrollableHeight = docHeight - winHeight;
                    var ratio = scrollableHeight / trackHeight;
                    var targetScrollTop = dragScrollStart + (deltaY * ratio);
                    targetScrollTop = Math.max(0, Math.min(targetScrollTop, scrollableHeight));
                    window.scrollTo({ top: targetScrollTop });
                }

                // 处理水平拖拽
                if (isDraggingH) {
                    var deltaX = e.clientX - dragStartPos;
                    var thumbWidth = thumbH.offsetWidth;
                    var trackWidth = winWidth - thumbWidth;
                    var scrollableWidth = docWidth - winWidth;
                    var ratio = scrollableWidth / trackWidth;
                    var targetScrollLeft = dragScrollStart + (deltaX * ratio);
                    targetScrollLeft = Math.max(0, Math.min(targetScrollLeft, scrollableWidth));
                    window.scrollTo({ left: targetScrollLeft });
                }
            });

            window.addEventListener('mouseup', function() {
                if (isDraggingV || isDraggingH) {
                    isDraggingV = false;
                    isDraggingH = false;
                    // 鼠标松开后，延迟隐藏
                    hideTimer = setTimeout(function() {
                        fakeScrollbarV.classList.remove('visible');
                        fakeScrollbarH.classList.remove('visible');
                    }, 800);
                }
            });

            // 4. 特殊页面样式
            var targetPaths = ['/ys', '/zzz'];
            var currentPath = window.location.pathname;
            if (targetPaths.some(function(p) { return currentPath.startsWith(p); })) {
                var s = document.createElement('style');
                s.textContent = 'a:focus:not(:focus-visible) { outline-style: none; }';
                document.head.appendChild(s);
            }

            // 5. 加载 InPageEdit 核心模块
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@inpageedit/core/dist/index.js';
            script.type = 'module';
            document.head.appendChild(script);

            // 6. 图标拖拽 + 记忆 + 归位
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
                    if (e.data && e.data.type === 'IPE_RESET_POSITION') doReset();
                });

                // 双击按钮归位
                dragHandle.addEventListener('dblclick', function(e) {
                    e.preventDefault(); e.stopPropagation(); doReset();
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
    pageScript.remove();// 注入后立即移除标签，保持 DOM 干净
})();
