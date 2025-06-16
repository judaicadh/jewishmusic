const withMT = require("@material-tailwind/react/utils/withMT");
const colors = require("tailwindcss/colors");

module.exports = withMT({
    darkMode: "class", // Use 'class' strategy for dark mode (adds flexibility)

    content: [
        "./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}",

        // Flowbite
        "./node_modules/flowbite/**/*.js",
        "./node_modules/flowbite-react/dist/types/components/**/*.ts",

        // Material Tailwind
        "./node_modules/@material-tailwind/react/components/**/*.{js,ts,jsx,tsx}",
        "./node_modules/@material-tailwind/react/theme/components/**/*.{js,ts,jsx,tsx}",

        // Datepicker (optional)
        "./node_modules/react-tailwindcss-datepicker/dist/index.esm.{js,ts,jsx,tsx}"
    ],

    theme: {

        extend: {
            colors: {
                primary: "#15668a",
                secondary: "#14171A",

                transparent: "transparent",
                current: "currentColor",

                black: colors.black,
                white: colors.white,
                sky: colors.sky,
                cyan: colors.cyan,
                blue: colors.blue,
                gray: colors.gray,
                stone: colors.stone,
                neutral: colors.neutral,
                zinc: colors.zinc,
                slate: colors.slate,
                rose: colors.rose,
                emerald: colors.emerald,
                indigo: colors.indigo,
                yellow: colors.yellow,

                orient: {
                    50: "#f2fafd",
                    100: "#e4f2fa",
                    200: "#c2e6f5",
                    300: "#8cd3ed",
                    400: "#4fbbe1",
                    500: "#28a3cf",
                    600: "#1984b0",
                    700: "#15668a",
                    800: "#165976",
                    900: "#184a62",
                    950: "#102f41",
                },
            },

            fontFamily: {
                serif: ['Oswald', 'sans-serif']
            },
        },
    },

    plugins: [
        require("flowbite/plugin"),
        require("@tailwindcss/typography"),
        require("@tailwindcss/forms"),
        require("@tailwindcss/aspect-ratio"),
        require("@tailwindcss/container-queries"),
    ],
});