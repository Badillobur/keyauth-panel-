/*
 * LMAx27Enc.h  —  Ofuscacion de strings en tiempo de compilacion
 * Uso: LMAx27("mi string secreto").c_str()
 *
 * Reemplaza XorStr. Encripta credentials para que no aparezcan
 * en texto plano en el binario compilado.
 */

#pragma once
#include <string>

#define LMAX_KEY_BASE  0x4C   // 'L'
#define LMAX_KEY_SALT  0x37   // '7'

template<size_t N>
class _LMAx27Enc {
    char _data[N];
    static constexpr char _enc(char c, size_t i) noexcept {
        return c ^ (char)(LMAX_KEY_BASE + (i * LMAX_KEY_SALT) % 31);
    }
    template<size_t... I>
    constexpr __forceinline _LMAx27Enc(const char (&s)[N], std::index_sequence<I...>) noexcept
        : _data{ _enc(s[I], I)... } {}
public:
    constexpr __forceinline _LMAx27Enc(const char (&s)[N]) noexcept
        : _LMAx27Enc(s, std::make_index_sequence<N>{}) {}

    __forceinline std::string c_str() const noexcept {
        char buf[N];
        for (size_t i = 0; i < N; i++)
            buf[i] = _enc(_data[i], i);
        return std::string(buf, N - 1);
    }
    __forceinline operator std::string() const noexcept { return c_str(); }
};

// Macro principal — uso: LMAx27("tu string")
template<size_t N>
constexpr __forceinline _LMAx27Enc<N> LMAx27(const char (&s)[N]) {
    return _LMAx27Enc<N>(s);
}
