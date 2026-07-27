// ==UserScript==
// @name         IPE NEXT 个人定制版
// @namespace    https://github.com/lylx1997
// @version      0.2.1
// @description  动态加载 InPageEdit NEXT，并集成个人定制功能强化。
// @author       乐与乐寻
// @match        https://wiki.biligame.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    window.RLQ = window.RLQ || [];
    window.RLQ.push(() => {
        // 1. 注入自定义 CSS
        //修复 CodeMirror 插件设置框太小的问题
        //隐藏按钮鼠标悬浮淡入显示，点击固定时强制保持显示
        const customCSS = `
            .oo-ui-window-frame { max-height: 400px !important; }
            .oo-ui-window-content { height: 400px; }
            #ipe-edit-toolbox #toolbox-toggler {
                opacity: 0.3;
                transition: opacity 0.3s ease;
                z-index: 10;
            }
            #ipe-edit-toolbox #toolbox-toggler:hover,
            #ipe-edit-toolbox.is-persistent #toolbox-toggler,
            #ipe-edit-toolbox .btn-group:hover ~ #toolbox-toggler {
                opacity: 1;
            }
            #ipe-edit-toolbox #toolbox-toggler::before {
                content: '';
                position: absolute;
                top: -10px;
                left: -6px;
                right: 0;
                bottom: 0;
                clip-path: polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 12px 0%, 12px calc(100% - 41px), 0% calc(100% - 41px), 0% 0%);
            }
        `;
        const styleTag = document.createElement('style');
        styleTag.textContent = customCSS;
        document.head.appendChild(styleTag);

        // 2. 配置需要注入特殊样式的页面路径前缀列表
        const targetPaths = ['/ys', '/zzz'];
        const currentPath = window.location.pathname;
        if (targetPaths.some(path => currentPath.startsWith(path))) {
            const specialStyleTag = document.createElement('style');
            specialStyleTag.textContent = `a:focus:not(:focus-visible) { outline-style: none; }`;
            document.head.appendChild(specialStyleTag);
        }

        // 3. 加载 InPageEdit 核心模块
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@inpageedit/core/dist/index.js';
        script.type = 'module';
        document.head.appendChild(script);

        // 4. 稳定拖拽逻辑
        const observer = new MutationObserver(() => {
            const toolbox = document.getElementById('ipe-edit-toolbox');
            const handle = document.getElementById('toolbox-toggler');

            if (toolbox && handle && !handle.dataset.dragInit) {
                handle.dataset.dragInit = 'true';
                initSafeDrag(toolbox, handle);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 核心拖拽函数
        function initSafeDrag(targetElement, dragHandle) {
            let isDragging = false;
            let hasMoved = false;
            let startX, startY;
            let currentTranslateX = 0;
            let currentTranslateY = 0;

            // 触发拖动的最小像素阈值（防误触）
            const DRAG_THRESHOLD = 3;

            // 监听鼠标按下
            dragHandle.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;

                isDragging = true;
                hasMoved = false;
                startX = e.clientX - currentTranslateX;
                startY = e.clientY - currentTranslateY;

                e.preventDefault();
            });

            // 监听鼠标移动
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                // 只有当移动距离超过阈值时，才真正开始拖动
                if (!hasMoved && Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) {
                    hasMoved = true;
                    // 按下时屏蔽整个工具箱的鼠标事件，更跟手
                    targetElement.style.pointerEvents = 'none';
                }

                if (hasMoved) {
                    e.preventDefault();
                    currentTranslateX = dx;
                    currentTranslateY = dy;
                    targetElement.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
                }
            });

            // 监听鼠标松开
            document.addEventListener('mouseup', () => {
                if (isDragging && hasMoved) {
                    // 恢复鼠标事件
                    targetElement.style.pointerEvents = '';
                }
                isDragging = false;
            });
        }
    });
})();
