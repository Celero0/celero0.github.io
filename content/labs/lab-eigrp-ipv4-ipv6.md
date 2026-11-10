+++
draft = false
title = "Configurando EIGRP en IPv4 e IPv6"
date = 2026-11-07T16:00:00Z
description = "Laboratorio de EIGRP: corrección de configuraciones, dos dominios EIGRP redistribuidos, summarización, métrica K, temporizadores y balanceo de carga en IPv4 e IPv6."
weight = 5
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #EIGRP #IPv4 #IPv6 #Redistribución #Summarización
---

# Introducción

Este laboratorio parte de una topología con **configuraciones de EIGRP ya aplicadas por otro especialista** que no funcionan correctamente. La tarea es detectar los errores, corregirlos y completar el despliegue de EIGRP en IPv4 e IPv6.

El escenario tiene dos dominios EIGRP separados que se unen en R2:

- **Lado R1**: EIGRPv4 AS 20 y EIGRPv6 AS 40.
- **Lado R2-R3-R4**: EIGRPv4 AS 5 y EIGRPv6 AS 10.

A lo largo del laboratorio se practica:

- Verificación del direccionamiento base.
- Configuración y corrección de EIGRP en IPv4 e IPv6.
- Uso de `passive-interface` correctamente.
- Redistribución de rutas estáticas y entre sistemas autónomos.
- Cálculo de métrica con los pesos K.
- Summarización de rutas en R1.
- Temporizadores EIGRP en IPv6.
- Balanceo de carga con `delay` y `variance`.

# Topología

<img src="/images/Pasted image 20250514165134.png" style="width:100%; height:auto; display:block; margin:auto;">

- **R1**: tres loopbacks (`172.16.10.1/24`, `172.16.20.1/24`, `172.16.30.1/24`) y un enlace hacia R2 por `192.168.12.0/24`. EIGRPv4 AS 20 / EIGRPv6 AS 40.
- **R2**: router frontera entre los dos dominios. Conecta con R1 (`192.168.12.0/24`), con R4 (`192.168.24.0/24`) y con R3 (`192.168.23.0/24`).
- **R3**: conecta con R2 (`192.168.23.0/24`) y con R4 (`192.168.34.0/24`).
- **R4**: conecta con R2 (`192.168.24.0/24`), con R3 (`192.168.34.0/24`) y con el ISP (`210.0.0.0/28`).
- **ISP**: loopback `8.8.8.8/32` y enlace `210.0.0.0/28`.
- **IPv6**: los mismos enlaces usan `3001:ABCD:ABCD:<enlace>::/64` y las loopbacks de R1 `3001:ABCD:ABCD:A:{10,20,30}::1/128`.

| Enlace | IPv4 | IPv6 |
|---|---|---|
| R1-R2 | `192.168.12.0/24` | `3001:ABCD:ABCD:12::/64` |
| R2-R3 | `192.168.23.0/24` | `3001:ABCD:ABCD:23::/64` |
| R2-R4 | `192.168.24.0/24` | `3001:ABCD:ABCD:24::/64` |
| R3-R4 | `192.168.34.0/24` | `3001:ABCD:ABCD:34::/64` |
| R4-ISP | `210.0.0.0/28` | `3001:ABCD:ABCD:210::/112` |

# Requerimientos

- Detectar y corregir las configuraciones EIGRP defectuosas.
- Habilitar EIGRP IPv4 con `router-id` en formato `X.X.X.X` y configurar `passive-interface` donde corresponda.
- Habilitar EIGRP IPv6 a nivel de interfaz, con `router-id` en formato `XX.XX.XX.XX`.
- Garantizar salida a Internet en IPv4 e IPv6.
- Hacer que R1 envíe rutas sumarizadas hacia R2 en ambos protocolos.
- Redistribuir entre los AS de EIGRP usando los valores de las interfaces como parámetros K.
- Balancear la carga entre R2, R3 y R4 desde la loopback hacia el ISP y viceversa.
- En IPv4, usar solo los primeros cuatro parámetros K para el cálculo de métrica.
- En IPv6, fijar `hello` en 3 segundos y `hold-time` en 9 segundos.
- Comprobar conectividad completa.

# Desarrollo

## 1. Verificación del direccionamiento base

Antes de tocar EIGRP se revisa que las IPs estén bien configuradas. En R1 el direccionamiento ya es correcto, así que se usa como punto de partida.

```bash
en
show ip interface brief
show running-config
```

## 2. EIGRP IPv4: AS 20 y AS 5

### R1 — AS 20

R1 anuncia sus tres loopbacks y el enlace hacia R2. Las loopbacks se marcan como pasivas porque no tienen vecinos EIGRP.

```bash
en
conf t
router eigrp 20
eigrp router-id 1.1.1.1
network 192.168.12.0 0.0.0.255
network 172.16.10.0 0.0.0.255
network 172.16.20.0 0.0.0.255
network 172.16.30.0 0.0.0.255
passive-interface loopback 1
passive-interface loopback 2
passive-interface loopback 3
ex
```

### R2 — AS 20

R2 solo necesita anunciar el enlace hacia R1 dentro del AS 20.

```bash
en
conf t
router eigrp 20
eigrp router-id 2.2.2.2
network 192.168.12.0 0.0.0.255
ex
```

### R2 — AS 5 (configuración defectuosa)

La configuración previa del AS 5 estaba mal: usaba una máscara `0.0.0.0`, lo que anunciaba una única dirección en lugar de la subred completa. Se elimina el proceso y se crea de nuevo.

<img src="/images/Pasted image 20250514185532.png" style="width:100%; height:auto; display:block; margin:auto;">

```bash
no router eigrp 5
```

```bash
router eigrp 5
router-id 2.2.2.2
network 192.168.24.0 0.0.0.255
network 192.168.23.0 0.0.0.255
ex
```

### R3 — AS 5

```bash
en
conf t
router eigrp 5
router-id 3.3.3.3
network 192.168.23.0 0.0.0.255
network 192.168.34.0 0.0.0.255
ex
```

### R4 — AS 5

```bash
en
conf t
router eigrp 5
router-id 4.4.4.4
network 192.168.24.0 0.0.0.255
network 192.168.34.0 0.0.0.255
ex
```

## 3. EIGRP IPv6: AS 40 y AS 10

En IPv6, EIGRP se habilita **dentro de cada interfaz** con `ipv6 eigrp <AS>`, no con `network`. Además hay que habilitar el routing IPv6 con `ipv6 unicast-routing`.

### R1 — AS 40

```bash
ipv6 unicast-routing
ipv6 router eigrp 40
eigrp router-id 1.1.1.1
passive-interface loopback 1
passive-interface loopback 2
passive-interface loopback 3
ex
int e0/0
ipv6 eigrp 40
ex
int l1
ipv6 eigrp 40
ex
int l2
ipv6 eigrp 40
ex
int l3
ipv6 eigrp 40
ex
```

### R2 — AS 40

```bash
ipv6 unicast-routing
ipv6 router eigrp 40
eigrp router-id 2.2.2.2
ex
int e0/0
ipv6 eigrp 40
ex
```

### R2 — AS 10

```bash
ipv6 router eigrp 10
router-id 2.2.2.2
ex
int e0/1
ipv6 eigrp 10
ex
int e0/3
ipv6 eigrp 10
ex
```

### R3 — AS 10

```bash
ipv6 unicast-routing
ipv6 router eigrp 10
router-id 3.3.3.3
ex
int e0/3
ipv6 eigrp 10
ex
int e0/2
ipv6 eigrp 10
ex
```

### R4 — AS 10

```bash
ipv6 unicast-routing
ipv6 router eigrp 10
router-id 4.4.4.4
ex
int e0/1
ipv6 eigrp 10
ex
int e0/2
ipv6 eigrp 10
ex
```

## 4. Corrección de interfaces pasivas

Una interfaz marcada como pasiva no envía ni procesa hellos, por lo que **no puede formar vecindades**. En la configuración previa, `e0/0` de R1 estaba pasiva por error. Se comprueba con `show ip protocols` y se corrige.

```bash
router eigrp 20
no passive-interface e0/0
ex
ipv6 router eigrp 40
no passive-interface e0/0
ex
```

## 5. Salida a Internet y redistribución de rutas estáticas

R4 es el router de borde. Conoce al ISP por una ruta estática por defecto y la redistribuye en EIGRP para que el resto del dominio sepa cómo salir.

**R4**

```bash
ip route 0.0.0.0 0.0.0.0 210.0.0.6
ipv6 route ::/0 3001:ABCD:ABCD:210::6
router eigrp 5
redistribute static
ex
ipv6 router eigrp 10
redistribute static
ex
```

**ISP** — ruta de retorno hacia la red interna

```bash
ip route 0.0.0.0 0.0.0.0 210.0.0.5
ipv6 route ::/0 3001:ABCD:ABCD:210::5
```

## 6. Redistribución entre AS de EIGRP

R2 pertenece a los dos dominios, pero EIGRP no redistribuye entre AS automáticamente. Hay que hacerlo en ambos sentidos y en ambos protocolos. La métrica se toma de los valores de la interfaz: ancho de banda, delay, confiabilidad, carga y MTU.

**R2 — IPv4**

```bash
router eigrp 5
redistribute eigrp 20 metric 10000 100 255 1 1500
ex
router eigrp 20
redistribute eigrp 5 metric 10000 100 255 1 1500
ex
```

**R2 — IPv6** (con `include-connected`)

```bash
router eigrp 10
redistribute eigrp 40 metric 10000 100 255 1 1500 include-connected
ex
router eigrp 40
redistribute eigrp 10 metric 10000 100 255 1 1500 include-connected
ex
```

## 7. Cálculo de métrica con los pesos K

Por defecto EIGRP usa ancho de banda y delay. El requerimiento pide, en IPv4, usar los **cuatro primeros parámetros K**. El comando `metric weights` recibe seis valores: `TOS K1 K2 K3 K4 K5`. El primero (TOS) siempre es 0.

```bash
metric weights 0 1 1 1 1 0
```

**R1**

```bash
router eigrp 20
metric weights 0 1 1 1 1 0
ex
```

**R2**

```bash
router eigrp 20
metric weights 0 1 1 1 1 0
ex
router eigrp 5
metric weights 0 1 1 1 1 0
ex
```

**R3**

```bash
router eigrp 5
metric weights 0 1 1 1 1 0
ex
```

**R4**

```bash
router eigrp 5
metric weights 0 1 1 1 1 0
ex
```

## 8. Summarización de rutas en R1

R1 debe enviar sus tres loopbacks como una sola ruta sumarizada hacia R2. El comando se aplica **en la interfaz de salida**, no en el proceso EIGRP.

<img src="/images/Pasted image 20250519165121.png" style="width:100%; height:auto; display:block; margin:auto;">

### IPv4

Las loopbacks `172.16.10.0/24`, `172.16.20.0/24` y `172.16.30.0/24` se resumen en `172.16.0.0/19` (máscara `255.255.224.0`), que cubre el rango `172.16.0.0`–`172.16.31.255`.

<img src="/images/Pasted image 20250519165152.png" style="width:100%; height:auto; display:block; margin:auto;">

```bash
int e0/0
ip summary-address eigrp 20 172.16.0.0 255.255.224.0
ex
```

### IPv6

<img src="/images/Pasted image 20250519173115.png" style="width:100%; height:auto; display:block; margin:auto;">

```bash
int e0/0
ipv6 summary-address eigrp 40 3001:ABCD:ABCD:A::/74
ex
```

## 9. Temporizadores EIGRP en IPv6

El requerimiento pide `hello` de 3 segundos y `hold-time` de 9 segundos. Los temporizadores se configuran **por interfaz** y deben coincidir en ambos extremos del enlace. El `hold-time` debe ser al menos tres veces el `hello`.

**R1**

```bash
interface e0/0
ipv6 hello-interval eigrp 40 3
ipv6 hold-time eigrp 40 9
ex
```

**R2**

```bash
interface e0/0
ipv6 hello-interval eigrp 40 3
ipv6 hold-time eigrp 40 9
ex
interface e0/1
ipv6 hello-interval eigrp 10 3
ipv6 hold-time eigrp 10 9
ex
interface e0/3
ipv6 hello-interval eigrp 10 3
ipv6 hold-time eigrp 10 9
ex
```

**R3**

```bash
interface e0/3
ipv6 hello-interval eigrp 10 3
ipv6 hold-time eigrp 10 9
ex
interface e0/2
ipv6 hello-interval eigrp 10 3
ipv6 hold-time eigrp 10 9
ex
```

**R4**

```bash
interface e0/1
ipv6 hello-interval eigrp 10 3
ipv6 hold-time eigrp 10 9
ex
interface e0/2
ipv6 hello-interval eigrp 10 3
ipv6 hold-time eigrp 10 9
ex
```

## 10. Balanceo de carga

El objetivo es que el tráfico entre la loopback de R1 y el ISP se reparta entre los caminos que pasan por R2, R3 y R4. Hay dos palancas:

- **`delay`**: un delay menor reduce la métrica y hace que la interfaz sea preferida. Se ajusta en los enlaces del lado R3/R4 para acercar sus métricas a la del camino directo por R2.
- **`variance`**: permite instalar en la tabla de routing rutas con métrica hasta N veces la mejor. Sin `variance`, EIGRP solo instala la ruta de menor métrica.

**R4**

```bash
int e0/2
delay 1
ex
```

**R3**

```bash
int e0/2
delay 1
ex
int e0/3
delay 1
ex
```

**R2**

```bash
int e0/3
delay 1
ex
```

**R2 y R4** — habilitar el balanceo

```bash
router eigrp 5
variance 2
ex
```

## Verificación

- **Vecindades**
  - `show ip eigrp neighbors` — vecinos en ambos AS IPv4.
  - `show ipv6 eigrp neighbors` — vecinos en ambos AS IPv6.
- **Protocolos y interfaces pasivas**
  - `show ip protocols` — revisar qué interfaces están pasivas y qué redes se anuncian.
  - `show ipv6 protocols`.
- **Rutas**
  - `show ip route eigrp` y `show ipv6 route eigrp`.
  - `show ip route 8.8.8.8` — debe salir por R4 hacia el ISP.
  - `show ip route 172.16.0.0` en R2 — debe aparecer la ruta sumarizada.
- **Balanceo**
  - `show ip route 8.8.8.8` — revisar si hay varias rutas instaladas.
  - `show ip eigrp topology` — ver sucesores y sucesores factibles.
- **Conectividad**
  - `ping 8.8.8.8 source 172.16.10.1` desde R1.
  - `ping 3001:ABCD:ABCD:8::8 source 3001:ABCD:ABCD:A:10::1` desde R1.
  - `traceroute` para confirmar los paths hacia el ISP.

# Conclusión

El laboratorio cubre EIGRP en IPv4 e IPv6 con dos dominios separados: corrección de configuraciones, vecindades, interfaces pasivas, redistribución de estáticas y entre AS, pesos K, summarización, temporizadores y balanceo de carga.

Los errores más comunes al reproducirlo son: dejar una interfaz pasiva donde debe haber vecinos, usar `network` en IPv6 en lugar de `ipv6 eigrp` dentro de la interfaz, olvidar `include-connected` al redistribuir IPv6, aplicar la summarización en el proceso en lugar de la interfaz, y no igualar los temporizadores en ambos extremos.
