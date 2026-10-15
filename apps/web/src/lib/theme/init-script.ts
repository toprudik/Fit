import { TELEGRAM_SCHEME_KEY, THEME_COOKIE } from "./theme";

/** Where tma.js keeps the launch params for the page loads after the launch (sessionStorage). */
const TMA_LAUNCH_PARAMS_KEY = "tapps/launchParams";

/**
 * Runs in <head> before the first paint and sets data-theme on <html>, so the statically
 * prerendered page never flashes the wrong theme. Mirrors resolveTheme(): pinned preference
 * from the cookie, else Telegram's scheme (launch hash, then the value saved this session),
 * else prefers-color-scheme. Inside the Mini App (launch params in the URL or saved by tma.js)
 * it also sets data-telegram, so /login hides the website's way in before hydration; the
 * Telegram provider removes it if the SDK does not start. Kept dependency-free on purpose;
 * src/lib/theme/init-script.test.ts runs this exact string.
 */
export const themeInitScript = `(function(){try{
var d=document.documentElement,t=null,c=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/),p=c?decodeURIComponent(c[1]):"system";
try{if(/[#?&]tgWebAppData=/.test(location.hash+location.search)||sessionStorage.getItem("${TMA_LAUNCH_PARAMS_KEY}"))d.setAttribute("data-telegram","")}catch(e){}
if(p==="light"||p==="dark"){t=p}else{
try{var h=new URLSearchParams(location.hash.slice(1)).get("tgWebAppThemeParams");if(h){var bg=String(JSON.parse(h).bg_color||"").replace("#","");if(/^[0-9a-f]{6}$/i.test(bg)){var n=parseInt(bg,16),r=n>>16&255,g=n>>8&255,b=n&255;t=Math.sqrt(.299*r*r+.587*g*g+.114*b*b)<120?"dark":"light";sessionStorage.setItem("${TELEGRAM_SCHEME_KEY}",t)}}}catch(e){}
if(!t){try{var s=sessionStorage.getItem("${TELEGRAM_SCHEME_KEY}");if(s==="light"||s==="dark")t=s}catch(e){}}
if(!t){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}}
d.setAttribute("data-theme",t)}catch(e){}})()`;
