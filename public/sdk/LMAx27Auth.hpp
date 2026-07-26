/*
 * ============================================================
 *   LMAx27Auth.hpp  —  v2.0
 *   Sistema de autenticacion y licencias LMAx27
 *   Contacto: https://wa.me/51928140884
 * ============================================================
 *
 *  USO RAPIDO (Kaflow.hpp):
 *
 *    #include "LMAx27Auth.hpp"
 *
 *    std::string name    = LMAx27("TuApp").c_str();
 *    std::string ownerid = LMAx27("TuOwnerID").c_str();
 *    std::string secret  = LMAx27("TuSecret").c_str();
 *    std::string version = LMAx27("1.0").c_str();
 *    std::string url     = LMAx27("https://tu-servidor.com/api/1.2/").c_str();
 *
 *    lmax::api Auth(name, ownerid, secret, version, url);
 *
 *  USO (WinMain.hpp, antes del Auth.init()):
 *
 *    name    = LMAx27("TuApp").c_str();
 *    ownerid = LMAx27("TuOwnerID").c_str();
 *    secret  = LMAx27("TuSecret").c_str();
 *    version = LMAx27("1.0").c_str();
 *    url     = LMAx27("https://tu-servidor.com/api/1.2/").c_str();
 *    Auth.init();
 *
 * ============================================================
 */

#pragma once
#include <Windows.h>
#include <winhttp.h>
#include <string>
#include <vector>
#include <sstream>

#pragma comment(lib, "winhttp.lib")

// ─── Ofuscacion de strings LMAx27 ────────────────────────────────────────────
// Uso: LMAx27("mi texto secreto").c_str()
// Encripta strings en tiempo de compilacion para proteger credenciales

#define ALWAYS_INLINE __forceinline

template<typename _Str, size_t _Len>
class _LMAx27_Str {
    using val = typename _Str::value_type;
    static constexpr val crypt(val c, size_t i) noexcept { return c ^ (val)(0x4C + i % 7); }
    val data[_Len];
    mutable bool decrypted = false;
public:
    constexpr ALWAYS_INLINE _LMAx27_Str(val const (&str)[_Len]) noexcept
        : _LMAx27_Str(str, std::make_index_sequence<_Len - 1>{}) {}
    template<size_t... I>
    constexpr ALWAYS_INLINE _LMAx27_Str(val const (&str)[_Len], std::index_sequence<I...>) noexcept
        : data{ crypt(str[I], I)..., '\0' }, decrypted(false) {}
    ALWAYS_INLINE _Str c_str() const noexcept {
        val buf[_Len];
        for (size_t i = 0; i < _Len - 1; i++) buf[i] = crypt(data[i], i);
        buf[_Len - 1] = '\0';
        return _Str(buf);
    }
    ALWAYS_INLINE operator _Str() const noexcept { return c_str(); }
};

template<size_t _Len> using LMAx27A = _LMAx27_Str<std::string,  _Len>;
template<size_t _Len> using LMAx27W = _LMAx27_Str<std::wstring, _Len>;

template<size_t _Len>
constexpr ALWAYS_INLINE auto LMAx27(char const (&str)[_Len]) { return LMAx27A<_Len>(str); }
template<size_t _Len>
constexpr ALWAYS_INLINE auto LMAx27(wchar_t const (&str)[_Len]) { return LMAx27W<_Len>(str); }

// ─── JSON Parser (sin dependencias externas) ─────────────────────────────────
namespace _LMaxJson {
    static std::string get(const std::string& j, const std::string& key) {
        std::string search = "\"" + key + "\"";
        size_t p = j.find(search);
        if (p == std::string::npos) return "";
        p = j.find(':', p);
        if (p == std::string::npos) return "";
        while (++p < j.size() && (j[p] == ' ' || j[p] == '\t'));
        if (p >= j.size()) return "";
        if (j[p] == '"') {
            std::string r; p++;
            while (p < j.size() && j[p] != '"') {
                if (j[p] == '\\') p++;
                r += j[p++];
            }
            return r;
        }
        std::string r;
        while (p < j.size() && j[p] != ',' && j[p] != '}' && j[p] != ']' && j[p] != '\n')
            r += j[p++];
        while (!r.empty() && (r.back() == ' ' || r.back() == '\r')) r.pop_back();
        return r;
    }
    static bool getBool(const std::string& j, const std::string& key) {
        auto v = get(j, key); return v == "true" || v == "1";
    }
    static std::string getObj(const std::string& j, const std::string& key) {
        size_t p = j.find("\"" + key + "\"");
        if (p == std::string::npos) return "{}";
        p = j.find('{', p);
        if (p == std::string::npos) return "{}";
        int d = 0; size_t s = p;
        while (p < j.size()) {
            if (j[p] == '{') d++;
            else if (j[p] == '}' && --d == 0) return j.substr(s, p - s + 1);
            p++;
        }
        return "{}";
    }
    static std::vector<std::string> getArr(const std::string& j, const std::string& key) {
        std::vector<std::string> items;
        size_t p = j.find("\"" + key + "\"");
        if (p == std::string::npos) return items;
        p = j.find('[', p);
        if (p == std::string::npos) return items;
        p++;
        while (p < j.size()) {
            while (p < j.size() && (j[p] == ' ' || j[p] == ',' || j[p] == '\n' || j[p] == '\r')) p++;
            if (p >= j.size() || j[p] == ']') break;
            if (j[p] == '{') {
                int d = 0; size_t s = p;
                while (p < j.size()) {
                    if (j[p] == '{') d++;
                    else if (j[p] == '}' && --d == 0) { items.push_back(j.substr(s, p - s + 1)); p++; break; }
                    p++;
                }
            } else p++;
        }
        return items;
    }
}

// ─── Namespace LMAx27 ─────────────────────────────────────────────────────────
namespace lmax {

    struct subscription_t {
        std::string name;
        std::string expiry;
    };

    struct userdata_t {
        std::string username;
        std::string ip;
        std::string hwid;
        std::string createdate;
        std::string lastlogin;
        std::vector<subscription_t> subscriptions;
    };

    struct appdata_t {
        std::string numUsers;
        std::string numOnlineUsers;
        std::string numKeys;
        std::string version;
    };

    struct response_t {
        bool        success  = false;
        std::string message;
    };

    class api {
    public:
        std::string name, ownerid, secret, version, url;

        api(std::string n, std::string o, std::string s, std::string v, std::string u)
            : name(n), ownerid(o), secret(s), version(v), url(u) {}

        userdata_t  user_data;
        appdata_t   app_data;
        response_t  response;

    private:
        std::string sessionid;

        // ─── HTTP POST via WinHTTP ────────────────────────────────────────────
        std::string httpPost(const std::string& fields) {
            std::string host, path;
            bool isHttps = false;
            std::string u = url;
            if (u.substr(0, 8) == "https://") { isHttps = true; u = u.substr(8); }
            else if (u.substr(0, 7) == "http://") { u = u.substr(7); }
            size_t slash = u.find('/');
            if (slash != std::string::npos) { host = u.substr(0, slash); path = u.substr(slash); }
            else { host = u; path = "/"; }

            std::wstring wHost(host.begin(), host.end());
            std::wstring wPath(path.begin(), path.end());

            HINTERNET hSession = WinHttpOpen(L"LMAx27Auth/2.0",
                WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
            if (!hSession) return "";

            INTERNET_PORT port = isHttps ? INTERNET_DEFAULT_HTTPS_PORT : INTERNET_DEFAULT_HTTP_PORT;
            HINTERNET hConnect = WinHttpConnect(hSession, wHost.c_str(), port, 0);
            if (!hConnect) { WinHttpCloseHandle(hSession); return ""; }

            DWORD flags = isHttps ? WINHTTP_FLAG_SECURE : 0;
            HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", wPath.c_str(),
                NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
            if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return ""; }

            if (isHttps) {
                DWORD opt = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID |
                            SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
                WinHttpSetOption(hRequest, WINHTTP_OPTION_SECURITY_FLAGS, &opt, sizeof(opt));
            }

            std::wstring headers = L"Content-Type: application/x-www-form-urlencoded\r\n";
            BOOL ok = WinHttpSendRequest(hRequest,
                headers.c_str(), (DWORD)-1,
                (LPVOID)fields.c_str(), (DWORD)fields.size(), (DWORD)fields.size(), 0);

            if (!ok || !WinHttpReceiveResponse(hRequest, NULL)) {
                WinHttpCloseHandle(hRequest);
                WinHttpCloseHandle(hConnect);
                WinHttpCloseHandle(hSession);
                return "";
            }

            std::string result;
            DWORD bytesAvail = 0;
            while (WinHttpQueryDataAvailable(hRequest, &bytesAvail) && bytesAvail > 0) {
                std::vector<char> buf(bytesAvail + 1, 0);
                DWORD bytesRead = 0;
                WinHttpReadData(hRequest, buf.data(), bytesAvail, &bytesRead);
                result.append(buf.data(), bytesRead);
            }
            WinHttpCloseHandle(hRequest);
            WinHttpCloseHandle(hConnect);
            WinHttpCloseHandle(hSession);
            return result;
        }

        std::string getHWID() {
            char buf[256] = {};
            DWORD size = sizeof(buf);
            if (RegGetValueA(HKEY_LOCAL_MACHINE,
                "SOFTWARE\\Microsoft\\Cryptography",
                "MachineGuid", RRF_RT_REG_SZ, NULL, buf, &size) == ERROR_SUCCESS)
                return std::string(buf);
            DWORD serial = 0;
            GetVolumeInformationA("C:\\", NULL, 0, &serial, NULL, NULL, NULL, 0);
            return std::to_string(serial);
        }

        void parseResp(const std::string& j) {
            response.success = _LMaxJson::getBool(j, "success");
            response.message = _LMaxJson::get(j, "message");
        }

        void parseUser(const std::string& j) {
            std::string info = _LMaxJson::getObj(j, "info");
            if (info == "{}") return;
            user_data.username   = _LMaxJson::get(info, "username");
            user_data.ip         = _LMaxJson::get(info, "ip");
            user_data.hwid       = _LMaxJson::get(info, "hwid");
            user_data.createdate = _LMaxJson::get(info, "createdate");
            user_data.lastlogin  = _LMaxJson::get(info, "lastlogin");
            user_data.subscriptions.clear();
            for (auto& s : _LMaxJson::getArr(info, "subscriptions")) {
                subscription_t sc;
                sc.name   = _LMaxJson::get(s, "name");
                sc.expiry = _LMaxJson::get(s, "expiry");
                user_data.subscriptions.push_back(sc);
            }
        }

        void parseApp(const std::string& j) {
            std::string ai = _LMaxJson::getObj(j, "appinfo");
            if (ai == "{}") return;
            app_data.numUsers       = _LMaxJson::get(ai, "numUsers");
            app_data.numOnlineUsers = _LMaxJson::get(ai, "numOnlineUsers");
            app_data.numKeys        = _LMaxJson::get(ai, "numKeys");
            app_data.version        = _LMaxJson::get(ai, "version");
        }

    public:
        // ─── Inicializar sesion (llamar siempre primero) ──────────────────────
        void init() {
            auto resp = httpPost(
                "type=init&name=" + name +
                "&ownerid=" + ownerid +
                "&ver=" + version);
            if (resp.empty()) {
                response.success = false;
                response.message = "Error de conexion con el servidor LMAx27";
                return;
            }
            parseResp(resp);
            if (response.success) {
                sessionid = _LMaxJson::get(resp, "sessionid");
                parseApp(resp);
            }
        }

        // ─── Login con usuario y contrasena ──────────────────────────────────
        void login(std::string username, std::string password) {
            auto resp = httpPost(
                "type=login&username=" + username +
                "&pass=" + password +
                "&hwid=" + getHWID() +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
            if (response.success) parseUser(resp);
        }

        // ─── Registro con key de licencia ────────────────────────────────────
        void regstr(std::string username, std::string password, std::string key, std::string email = "") {
            auto resp = httpPost(
                "type=register&username=" + username +
                "&pass=" + password +
                "&key=" + key +
                "&email=" + email +
                "&hwid=" + getHWID() +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
            if (response.success) parseUser(resp);
        }

        // ─── Activar solo con key (sin cuenta) ───────────────────────────────
        void license(std::string key) {
            auto resp = httpPost(
                "type=license&key=" + key +
                "&hwid=" + getHWID() +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
            if (response.success) parseUser(resp);
        }

        // ─── Verificar sesion activa ──────────────────────────────────────────
        void check() {
            auto resp = httpPost(
                "type=check&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
        }

        // ─── Obtener variable remota ──────────────────────────────────────────
        std::string var(std::string varid) {
            auto resp = httpPost(
                "type=var&varid=" + varid +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
            return response.message;
        }

        // ─── Guardar log en el servidor ───────────────────────────────────────
        void log(std::string msg) {
            httpPost(
                "type=log&message=" + msg +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
        }

        // ─── Banear usuario actual ────────────────────────────────────────────
        void ban(std::string reason = "") {
            auto resp = httpPost(
                "type=ban&reason=" + reason +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
        }

        // ─── Verificar si el HWID esta en blacklist ───────────────────────────
        bool checkblack() {
            auto resp = httpPost(
                "type=checkblacklist&hwid=" + getHWID() +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
            return response.success;
        }

        // ─── Cambiar nombre de usuario ────────────────────────────────────────
        void changeUsername(std::string newusername) {
            auto resp = httpPost(
                "type=changeUsername&newUsername=" + newusername +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
        }

        // ─── Actualizar suscripcion con key ───────────────────────────────────
        void upgrade(std::string username, std::string key) {
            auto resp = httpPost(
                "type=upgrade&username=" + username +
                "&key=" + key +
                "&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
        }

        // ─── Compatibilidad con KeyAuth ───────────────────────────────────────
        void fetchstats() {
            auto resp = httpPost(
                "type=fetchstats&sessionid=" + sessionid +
                "&name=" + name +
                "&ownerid=" + ownerid);
            parseResp(resp);
            if (response.success) parseApp(resp);
        }

        void setvar(std::string varname, std::string vardata) {
            httpPost("type=setvar&var=" + varname + "&vardata=" + vardata +
                "&sessionid=" + sessionid + "&name=" + name + "&ownerid=" + ownerid);
        }
        std::string getvar(std::string varname) {
            auto resp = httpPost("type=getvar&var=" + varname +
                "&sessionid=" + sessionid + "&name=" + name + "&ownerid=" + ownerid);
            parseResp(resp); return response.message;
        }
        void forgot(std::string username, std::string email) {
            httpPost("type=forgot&username=" + username + "&email=" + email +
                "&sessionid=" + sessionid + "&name=" + name + "&ownerid=" + ownerid);
        }
        std::vector<unsigned char> download(std::string) { return {}; }
        void web_login() {}
        void button(std::string) {}
        std::string webhook(std::string, std::string, std::string = "", std::string = "") { return ""; }
    };
}
