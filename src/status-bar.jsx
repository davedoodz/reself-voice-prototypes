import './status-bar.css';

/* iOS status bar (9:41, signal, Wi-Fi, battery) and home indicator, traced from
   the Paper iPhone frame. Sits over the screen, under the device bezel, and
   never takes pointer input. `height` is the screen height in px. */
export function StatusBar({ height }) {
  return (
    <div className="ios-chrome" style={{ height }} aria-hidden="true">
      <svg className="ios-time" viewBox="0 0 37 14" width="37" height="14">
        <path d="M4.937 0C2.054 0 0 1.978 0 4.685v.019c0 2.532 1.787 4.398 4.338 4.398 1.824 0 2.985-.933 3.473-1.986h.184c0 .101-.009.203-.009.304-.102 2.551-.995 4.621-3.104 4.621-1.17 0-1.99-.61-2.34-1.543l-.027-.093H.175l.018.102C.617 12.549 2.441 14 4.882 14c3.343 0 5.36-2.661 5.36-7.152v-.019C10.242 2.024 7.774 0 4.937 0Zm-.009 7.273c-1.511 0-2.607-1.109-2.607-2.653v-.018c0-1.488 1.17-2.661 2.634-2.661 1.474 0 2.626 1.192 2.626 2.716v.019c0 1.506-1.152 2.597-2.653 2.597Z" />
        <path d="M14.424 5.027c.848 0 1.465-.647 1.465-1.46 0-.822-.617-1.46-1.465-1.46-.838 0-1.464.638-1.464 1.46 0 .813.626 1.46 1.464 1.46Zm0 6.857c.848 0 1.465-.638 1.465-1.46 0-.823-.617-1.46-1.465-1.46-.838 0-1.464.637-1.464 1.46 0 .822.626 1.46 1.464 1.46Z" />
        <path d="M25.054 13.667h2.275v-2.559h1.787V9.139h-1.787V.333h-3.362c-1.806 2.753-3.694 5.821-5.416 8.825v1.95h6.503v2.559Zm-4.293-4.472v-.139c1.29-2.264 2.828-4.731 4.191-6.82h.138v6.959h-4.329Z" />
        <path d="M34.624 13.667H37V.333h-2.367L31.16 2.782v2.245l3.307-2.347h.157v10.987Z" />
      </svg>
      <div className="ios-icons">
        <span className="ios-signal">
          <i style={{ height: 5 }} />
          <i style={{ height: 7 }} />
          <i style={{ height: 10 }} />
          <i style={{ height: 13 }} />
        </span>
        <svg className="ios-wifi" viewBox="0 0 21 15" width="21" height="15">
          <path d="M10.5 10c1.367 0 2.605.56 3.5 1.464L10.5 15 7 11.464C7.895 10.56 9.133 10 10.5 10Zm0-5c2.733 0 5.208 1.119 7 2.929l-2.1 2.121A6.18 6.18 0 0 0 10.5 8 6.18 6.18 0 0 0 5.6 10.05L3.5 7.929C5.29 6.119 7.766 5 10.5 5Zm0-5c4.1 0 7.812 1.68 10.5 4.394l-2.1 2.121C16.75 4.343 13.78 3 10.5 3 7.22 3 4.25 4.343 2.1 6.514L0 4.393C2.687 1.68 6.4 0 10.5 0Z" />
        </svg>
        <span className="ios-battery">
          <i className="ios-battery-case" />
          <i className="ios-battery-level" />
          <svg className="ios-battery-cap" viewBox="0 0 2 4" width="2" height="4">
            <path d="M0 0s2 .4 2 2-2 2-2 2V0Z" />
          </svg>
        </span>
      </div>
      <span className="ios-home" />
    </div>
  );
}
