"use client";

import { Component } from "react";

export default class ShellErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" dir="rtl">
          <div className="font-semibold">שגיאה במסך</div>
          <p className="mt-1">{this.state.error.message || "שגיאה לא ידועה"}</p>
          <button className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1" onClick={() => this.setState({ error: null })}>
            נסה שוב
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
