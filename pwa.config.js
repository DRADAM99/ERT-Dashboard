const pwaConfig = {
    dest: "public",
    disable: process.env.NODE_ENV === "development",
    register: true,
    skipWaiting: true,
    exclude: [ // ✅ Explicitly exclude unwanted files from precaching
      /\.map$/, 
      /manifest\.json$/,
    ],
  };
  
  export default pwaConfig;
  