/*
 * ═══════════════════════════════════════════════════════════════
 *   LMAx27Auth.h  —  SDK v2.0
 *   Sistema de autenticacion y licencias LMAx27
 *   Contacto: https://wa.me/51928140884
 *
 *   INSTRUCCIONES:
 *     1. Agrega LMAx27Auth.lib a tu proyecto (Linker -> Input)
 *     2. Agrega esta carpeta a Include Directories
 *     3. #include "LMAx27Auth.h"
 *     4. Usa LMAx27Enc.h para ofuscar strings
 * ═══════════════════════════════════════════════════════════════
 */

#pragma once
#include <string>
#include <vector>

#ifdef LMAX_EXPORTS
  #define LMAX_API __declspec(dllexport)
#else
  #define LMAX_API
#endif

namespace lmax {

    // ── Datos de suscripcion del usuario ─────────────────────────────────────
    struct Subscription {
        std::string name;
        std::string expiry;
    };

    // ── Datos del usuario autenticado ─────────────────────────────────────────
    struct UserData {
        std::string username;
        std::string ip;
        std::string hwid;
        std::string createdate;
        std::string lastlogin;
        std::vector<Subscription> subscriptions;
    };

    // ── Datos de la aplicacion ────────────────────────────────────────────────
    struct AppData {
        std::string numUsers;
        std::string numOnlineUsers;
        std::string numKeys;
        std::string version;
    };

    // ── Respuesta del servidor ────────────────────────────────────────────────
    struct Response {
        bool        success = false;
        std::string message;
    };

    // ════════════════════════════════════════════════════════════════════════
    //   Clase principal del SDK
    // ════════════════════════════════════════════════════════════════════════
    class LMAX_API Auth {
    public:
        // Datos publicos de lectura
        UserData    user;
        AppData     app;
        Response    response;

        // Constructor
        Auth(
            const std::string& appName,
            const std::string& ownerid,
            const std::string& secret,
            const std::string& version,
            const std::string& apiUrl
        );

        // ── Metodos de autenticacion ─────────────────────────────────────────

        // Inicializar sesion (SIEMPRE llamar primero)
        void init();

        // Login con usuario y contrasena
        void login(const std::string& username, const std::string& password);

        // Registrar nuevo usuario con key de licencia
        void regstr(const std::string& username, const std::string& password,
                    const std::string& key, const std::string& email = "");

        // Activar solo con key (sin cuenta de usuario)
        void license(const std::string& key);

        // Verificar que la sesion sigue activa
        void check();

        // Verificar si el HWID esta en lista negra
        bool checkblack();

        // ── Variables remotas ────────────────────────────────────────────────

        // Obtener variable del servidor
        std::string var(const std::string& varid);

        // Guardar variable de usuario
        void setvar(const std::string& name, const std::string& data);

        // Leer variable de usuario
        std::string getvar(const std::string& name);

        // ── Utilidades ───────────────────────────────────────────────────────

        // Enviar log al servidor
        void log(const std::string& message);

        // Banear al usuario actual
        void ban(const std::string& reason = "");

        // Cambiar nombre de usuario
        void changeUsername(const std::string& newUsername);

        // Actualizar suscripcion con nueva key
        void upgrade(const std::string& username, const std::string& key);

        // Obtener estadisticas de la app
        void fetchstats();

    private:
        // Implementacion interna — en LMAx27Auth.lib (no visible)
        struct Impl;
        Impl* m_impl;
    };

} // namespace lmax
