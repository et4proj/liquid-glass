import { useState } from "react";
import { NavBar, TabBar, Switch, Button, Dialog, Popup, ActionSheet, Toast } from "antd-mobile";
import { GlassSurface } from "@et4proj/liquid-glass-react";
import { AppOutline, FileOutline, UserOutline, SetOutline } from "antd-mobile-icons";
import "./demo.css";

/**
 * antd-mobile 演示页（产品代码视角：对 liquid-glass 零感知——
 * 不写 data-glass、不调任何 glass API，玻璃化完全由 adapter manifest 接管）。
 */
export default function App() {
  const [tab, setTab] = useState("gallery");
  const [popupVisible, setPopupVisible] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);

  const tabs = [
    { key: "gallery", title: "画廊", icon: <AppOutline /> },
    { key: "files", title: "文件", icon: <FileOutline /> },
    { key: "mine", title: "我的", icon: <UserOutline /> },
    { key: "settings", title: "设置", icon: <SetOutline /> },
  ];

  return (
    <div className="demo-shell">
      <NavBar back={null} right={<SetOutline />}>
        液态玻璃 · antd-mobile
      </NavBar>

      <main className="demo-body">
        <div className="demo-hero">
          <h2>无需改一行组件代码</h2>
          <p>
            本页全部 antd-mobile 组件未做任何 glass 相关修改；玻璃化由 adapter manifest（类名映射 +
            CSS 补丁）在运行时接管。
          </p>
        </div>

        {/* react 绑定层演示卡：GlassSurface 声明式表面 */}
        <GlassSurface as="section" role="card" className="demo-card">
          <h3>GlassSurface（react 绑定层）</h3>
          <p>声明式表面：role=&quot;card&quot;，由 useGlassSurface 注册。</p>
        </GlassSurface>

        <div className="demo-card">
          <h3>交互组件</h3>
          <div className="demo-row">
            <span>Switch（interactive 声明激活）</span>
            <Switch checked={switchOn} onChange={setSwitchOn} />
          </div>
          <div className="demo-actions">
            <Button
              block
              onClick={() => {
                Dialog.show({
                  title: "玻璃 Dialog",
                  content: "挂 body 的弹层：--glass-* 变量挂元素自身，继承不断链。",
                  closeOnAction: true,
                  actions: [{ key: "ok", text: "知道了" }],
                });
              }}
            >
              打开 Dialog
            </Button>
            <Button block onClick={() => setPopupVisible(true)}>
              打开 Popup
            </Button>
            <Button
              block
              onClick={() => {
                const handler = ActionSheet.show({
                  actions: [
                    { key: "a", text: "玻璃 ActionSheet" },
                    { key: "b", text: "第二项" },
                  ],
                  onAction: () => handler.close(),
                  cancelText: "取消",
                });
              }}
            >
              打开 ActionSheet
            </Button>
            <Button
              block
              onClick={() => {
                Toast.show("玻璃 Toast");
              }}
            >
              打开 Toast
            </Button>
          </div>
        </div>
      </main>

      <Popup
        visible={popupVisible}
        onMaskClick={() => setPopupVisible(false)}
        bodyStyle={{ height: "38vh" }}
      >
        <div className="demo-popup-body">
          <h3>底部 Popup</h3>
          <p>弹层内容 — 检查 .adm-popup 是否获得玻璃材质。</p>
        </div>
      </Popup>

      <div className="demo-tabbar">
        <TabBar activeKey={tab} onChange={setTab}>
          {tabs.map((t) => (
            <TabBar.Item key={t.key} icon={t.icon} title={t.title} />
          ))}
        </TabBar>
      </div>
    </div>
  );
}
