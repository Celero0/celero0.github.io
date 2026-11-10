+++
draft = false
title = "Prefix-Lists y Route-Maps"
date = 2026-11-08T08:00:00Z
description = "Laboratorio de redistribución y filtrado: OSPF y EIGRP, route-maps con métricas, prefix-lists, summarización de loopbacks y control de prefijos en IPv4 e IPv6."
weight = 6
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #OSPF #EIGRP #Prefix-List #Route-Map #Redistribución #IPv6
---

# Introducción

Este laboratorio conecta un dominio **OSPF** con un dominio **EIGRP** a través de un router de borde (R4). El reto no es solo hacer que ambos protocolos converjan, sino **controlar con precisión qué rutas se redistribuyen y cuáles se filtran** usando `prefix-list`, `route-map` y `distribute-list`.

A lo largo del laboratorio se practica:

- OSPF multiárea (área 2 y área 0) en IPv4 e IPv6.
- EIGRP AS 1 en IPv4 e IPv6.
- Redistribución bidireccional con `route-map` y métricas personalizadas.
- Redistribución directa en IPv6 con `include-connected`.
- Filtrado de rutas con `prefix-list` en OSPF y EIGRP.
- Tratamiento de loopbacks en OSPF con `ip ospf network point-to-point`.
- Control de prefijos por longitud (de /24 a /26).

# Topología

<img src="/images/Pasted image 20250520145456.png" style="width:100%; height:auto; display:block; margin:auto;">

- **R1**: router de acceso OSPF en el área 2. Conecta una LAN (`172.16.10.0/24`) y los enlaces hacia R2 y R3.
- **R2**: router interno del área 2, con tres loopbacks (`20.20.20.1/24`, `20.20.21.1/26`, `20.20.22.1/28`).
- **R3**: router ABR entre el área 2 y el área 0.
- **R4**: router ASBR entre OSPF (área 0) y EIGRP AS 1. Sus loopbacks IPv4 van por EIGRP y las IPv6 por OSPF.
- **R5**: router EIGRP con tres loopbacks (`50.50.50.1/18`, `50.50.51.1/21`, `50.50.52.1/24`).
- **R6**: router EIGRP con una LAN (`172.16.60.0/24`) y un PC conectado.

| Enlace | IPv4 | IPv6 |
|---|---|---|
| R1-R2 | `172.16.12.0/24` | `3001:ABCD:ABCD:12::/64` |
| R1-R3 | `172.16.13.0/24` | `3001:ABCD:ABCD:13::/64` |
| R2-R3 | `172.16.23.0/24` | `3001:ABCD:ABCD:23::/64` |
| R3-R4 | `172.16.34.0/24` | `3001:ABCD:ABCD:34::/64` |
| R4-R5 | `172.16.45.0/24` | `3001:ABCD:ABCD:45::/64` |
| R4-R6 | `172.16.46.0/24` | `3001:ABCD:ABCD:46::/64` |
| R5-R6 | `172.16.56.0/24` | `3001:ABCD:ABCD:56::/64` |

# Requerimientos

- Habilitar EIGRP según el AS propuesto y OSPF de forma clásica, con interfaces pasivas donde corresponda.
- En R4, las loopbacks IPv4 deben ir por EIGRP y las IPv6 por OSPF.
- Redistribuir entre protocolos en IPv4 mediante `route-map`:
  - **A.** EIGRP → OSPF debe llevar una métrica variable y, al pasar por el router de borde, sumar una métrica de 60.
  - **B.** OSPF → EIGRP debe usar los parámetros K de la interfaz correspondiente.
- La redistribución IPv6 entre OSPF y EIGRP debe ser directa.
- La loopback 2 de R2 no debe ser vista por R1 en IPv4.
- Las loopbacks de R5 deben ser vistas solo por R5 en IPv4.
- R6 no debe ver las loopbacks 5 ni 555 en IPv6.
- R4 debe permitir solo rutas IPv4 con prefijos entre /24 y /26.
- Comprobar conectividad completa.

# Desarrollo

## 1. OSPF IPv4

R1 y R2 están en el área 2; R3 es ABR entre el área 2 y el área 0; R4 cierra el área 0. Las loopbacks de R2 se marcan como pasivas porque no tienen vecinos.

**R1**

```bash
en
conf t
router ospf 1
router-id 1.1.1.1
network 172.16.10.0 0.0.0.255 area 2
network 172.16.13.0 0.0.0.255 area 2
network 172.16.12.0 0.0.0.255 area 2
passive-interface e0/0
ex
```

**R2**

```bash
en
conf t
router ospf 1
router-id 2.2.2.2
network 172.16.23.0 0.0.0.255 area 2
network 172.16.12.0 0.0.0.255 area 2
network 20.20.20.0 0.0.0.255 area 2
network 20.20.21.0 0.0.0.63 area 2
network 20.20.22.1 0.0.0.0 area 2
passive-interface l2
passive-interface l22
passive-interface l222
ex
```

**R3**

```bash
en
conf t
router ospf 1
router-id 3.3.3.3
network 172.16.23.0 0.0.0.255 area 2
network 172.16.13.0 0.0.0.255 area 2
network 172.16.34.0 0.0.0.255 area 0
ex
```

**R4**

```bash
en
conf t
router ospf 1
router-id 4.4.4.4
network 172.16.34.0 0.0.0.255 area 0
ex
```

> **Nota:** OSPF calcula el costo según el ancho de banda. Un enlace serial tiene costo 64 y uno Ethernet costo 10; se puede comprobar con `show ip ospf interface serial 1/1`.

## 2. OSPF IPv6

En IPv6, OSPF se habilita **por interfaz** con `ipv6 ospf <proceso> area <área>`.

**R1**

```bash
ipv6 unicast-routing
ipv6 router ospf 1
router-id 1.1.1.1
passive-interface e0/0
ex
int e0/0
ipv6 ospf 1 area 2
ex
int s1/1
ipv6 ospf 1 area 2
ex
int s1/2
ipv6 ospf 1 area 2
ex
```

**R2**

```bash
ipv6 unicast-routing
ipv6 router ospf 1
router-id 2.2.2.2
passive-interface l2
passive-interface l22
passive-interface l222
ex
int l2
ipv6 ospf 1 area 2
ex
int l22
ipv6 ospf 1 area 2
ex
int l222
ipv6 ospf 1 area 2
ex
int s1/1
ipv6 ospf 1 area 2
ex
int s1/0
ipv6 ospf 1 area 2
ex
```

**R3**

```bash
ipv6 unicast-routing
ipv6 router ospf 1
router-id 3.3.3.3
ex
int s1/2
ipv6 ospf 1 area 2
ex
int s1/0
ipv6 ospf 1 area 2
ex
int s1/1
ipv6 ospf 1 area 0
ex
```

**R4**

```bash
ipv6 unicast-routing
ipv6 router ospf 1
router-id 4.4.4.4
passive-interface l4
passive-interface l44
passive-interface l444
ex
int s1/1
ipv6 ospf 1 area 0
ex
int l4
ipv6 ospf 1 area 0
ex
int l44
ipv6 ospf 1 area 0
ex
int l444
ipv6 ospf 1 area 0
ex
```

## 3. EIGRP IPv4

R4, R5 y R6 forman el AS 1. R4 anuncia sus loopbacks IPv4 por EIGRP; las IPv6 quedan para OSPF.

**R4**

```bash
router eigrp 1
eigrp router-id 4.4.4.4
network 172.16.45.4 0.0.0.0
network 172.16.46.4 0.0.0.0
network 40.40.40.1 0.0.0.0
network 40.40.41.1 0.0.0.0
network 40.40.42.1 0.0.0.0
passive-interface l4
passive-interface l44
passive-interface l444
ex
```

**R5**

```bash
router eigrp 1
eigrp router-id 5.5.5.5
network 172.16.45.5 0.0.0.0
network 172.16.56.5 0.0.0.0
network 50.50.50.1 0.0.0.0
network 50.50.51.1 0.0.0.0
network 50.50.52.1 0.0.0.0
passive-interface l5
passive-interface l55
passive-interface l555
ex
```

**R6**

```bash
router eigrp 1
eigrp router-id 6.6.6.6
network 172.16.46.6 0.0.0.0
network 172.16.56.6 0.0.0.0
network 172.16.60.6 0.0.0.0
passive-interface e0/0
ex
```

## 4. EIGRP IPv6

**R4**

```bash
ipv6 router eigrp 1
eigrp router-id 4.4.4.4
ex
int s1/2
ipv6 eigrp 1
ex
int s1/3
ipv6 eigrp 1
ex
```

**R5**

```bash
ipv6 unicast-routing
ipv6 router eigrp 1
eigrp router-id 5.5.5.5
passive-interface l5
passive-interface l55
passive-interface l555
ex
int s1/2
ipv6 eigrp 1
ex
int s1/0
ipv6 eigrp 1
ex
int l5
ipv6 eigrp 1
ex
int l55
ipv6 eigrp 1
ex
int l555
ipv6 eigrp 1
ex
```

**R6**

```bash
ipv6 unicast-routing
ipv6 router eigrp 1
eigrp router-id 6.6.6.6
passive-interface e0/0
ex
int s1/3
ipv6 eigrp 1
ex
int s1/0
ipv6 eigrp 1
ex
int e0/0
ipv6 eigrp 1
ex
```

## 5. Redistribución EIGRP → OSPF (IPv4)

En R4 se define una `prefix-list` con **todas las redes que participan en EIGRP** y un `route-map` que las redistribuye hacia OSPF con métrica 60 y tipo 1.

```bash
ip prefix-list RUTAS-EIGRP permit 50.50.0.0/18
ip prefix-list RUTAS-EIGRP permit 50.50.48.0/21
ip prefix-list RUTAS-EIGRP permit 50.50.52.0/24
ip prefix-list RUTAS-EIGRP permit 172.16.45.0/24
ip prefix-list RUTAS-EIGRP permit 172.16.46.0/24
ip prefix-list RUTAS-EIGRP permit 172.16.60.0/24
ip prefix-list RUTAS-EIGRP permit 172.16.56.0/24
ip prefix-list RUTAS-EIGRP permit 40.40.40.0/25
ip prefix-list RUTAS-EIGRP permit 40.40.41.0/26
ip prefix-list RUTAS-EIGRP permit 40.40.42.0/27
```

```bash
route-map OSPF permit
match ip address prefix-list RUTAS-EIGRP
set metric 60
set metric-type type-1
ex
router ospf 1
redistribute eigrp 1 route-map OSPF subnets
ex
```

## 6. Redistribución OSPF → EIGRP (IPv4)

El proceso inverso usa otra `prefix-list` con las redes OSPF y un `route-map` que asigna la métrica de EIGRP. Los cinco valores corresponden a **ancho de banda, delay, confiabilidad, carga y MTU**; se obtienen de la interfaz con `show interface`.

```bash
ip prefix-list RUTAS-OSPF permit 172.16.10.0/24
ip prefix-list RUTAS-OSPF permit 172.16.13.0/24
ip prefix-list RUTAS-OSPF permit 172.16.12.0/24
ip prefix-list RUTAS-OSPF permit 172.16.23.0/24
ip prefix-list RUTAS-OSPF permit 20.20.20.0/24
ip prefix-list RUTAS-OSPF permit 20.20.21.0/26
ip prefix-list RUTAS-OSPF permit 20.20.22.0/28
ip prefix-list RUTAS-OSPF permit 172.16.34.0/24
```

```bash
route-map EIGRP permit
match ip address prefix-list RUTAS-OSPF
set metric 1544 2000 255 1 1500
ex
router eigrp 1
redistribute ospf 1 route-map EIGRP
ex
```

## 7. Redistribución directa en IPv6

En IPv6 no se usan route-maps: se redistribuye directamente y se agrega `include-connected` para incluir también las redes conectadas del protocolo de origen.

**EIGRP → OSPF**

```bash
ipv6 router ospf 1
redistribute eigrp 1 include-connected
ex
```

**OSPF → EIGRP**

```bash
ipv6 router eigrp 1
redistribute ospf 1 metric 1544 2000 255 1 1500 include-connected
ex
```

## 8. Filtrado con prefix-lists

### 8.1 R1 no debe ver la loopback 2 (IPv4)

Se crea una `prefix-list` que niega `20.20.20.0/24` y permite todo lo demás. La última línea es imprescindible: sin ella, el `deny` implícito bloquearía todas las rutas.

<img src="/images/Pasted image 20250520221626.png" style="width:100%; height:auto; display:block; margin:auto;">

```bash
ip prefix-list FILTRO-1 deny 20.20.20.0/24
ip prefix-list FILTRO-1 permit 0.0.0.0/0 le 32
router ospf 1
distribute-list prefix FILTRO-1 in s1/1
distribute-list prefix FILTRO-1 in s1/2
ex
```

### 8.2 Las loopbacks de R5 solo las ve R5 (IPv4)

Se filtran las tres loopbacks a la salida de las interfaces de R5, de modo que no se anuncien a R4 ni a R6.

```bash
ip prefix-list FILTRO-2 deny 50.50.0.0/18
ip prefix-list FILTRO-2 deny 50.50.48.0/21
ip prefix-list FILTRO-2 deny 50.50.52.0/24
ip prefix-list FILTRO-2 permit 0.0.0.0/0 le 32
router eigrp 1
distribute-list prefix FILTRO-2 out s1/0
distribute-list prefix FILTRO-2 out s1/2
ex
```

### 8.3 R6 no debe ver las loopbacks 5 ni 555 (IPv6)

En IPv6 se usa `ipv6 prefix-list` y se aplica como `distribute-list prefix-list`.

```bash
ipv6 prefix-list FILTRO-3 deny 3001:ABCD:ABCD:51::/64
ipv6 prefix-list FILTRO-3 deny 3001:ABCD:ABCD:53::/64
ipv6 prefix-list FILTRO-3 permit ::/0 le 128
ipv6 router eigrp 1
distribute-list prefix-list FILTRO-3 in s1/0
distribute-list prefix-list FILTRO-3 in s1/3
ex
```

### 8.4 R4 solo acepta prefijos /24 a /26 (IPv4)

La `prefix-list` con `ge 24 le 26` acepta únicamente prefijos cuya longitud esté entre 24 y 26 bits.

```bash
ip prefix-list FILTRO-4 permit 0.0.0.0/0 ge 24 le 26
router ospf 1
distribute-list prefix FILTRO-4 in s1/1
ex
router eigrp 1
distribute-list prefix FILTRO-4 in s1/2
distribute-list prefix FILTRO-4 in s1/3
ex
```

## 9. Loopbacks en OSPF: point-to-point

Por defecto, OSPF anuncia las interfaces loopback con máscara `/32`, sin importar la máscara configurada. Para que se anuncien con su máscara real (`/24`, `/26`, `/28`) se configura la red como `point-to-point`.

**R2**

```bash
int l2
ip ospf network point-to-point
ex
int l22
ip ospf network point-to-point
ex
int l222
ip ospf network point-to-point
ex
```

> Para reiniciar los procesos OSPF se usa `clear ip ospf process`; para revisar el routing, `show ip route`.

## Verificación

- **Vecindades**
  - `show ip ospf neighbor` — vecinos OSPF en `FULL`.
  - `show ip eigrp neighbors` — vecinos EIGRP en ambos AS.
  - `show ipv6 ospf neighbor` y `show ipv6 eigrp neighbors`.
- **Rutas**
  - `show ip route ospf`, `show ip route eigrp`.
  - `show ipv6 route ospf`, `show ipv6 route eigrp`.
  - `show ip route 172.16.10.0` en R6 — debe llegar por redistribución desde OSPF.
  - `show ip route 20.20.20.0` en R1 — no debe aparecer (filtro de la loopback 2).
- **Filtros**
  - `show ip prefix-list` y `show ipv6 prefix-list`.
  - `show route-map`.
  - `show ip protocols` — revisar `distribute-list` y redistribución.
- **Redistribución**
  - `show ip ospf database external` — LSAs tipo 5 generados por R4.
  - `show ip eigrp topology` — rutas redistribuidas desde OSPF.
- **Conectividad**
  - `ping` entre el PC de R1 y el PC de R6.
  - `ping` entre loopbacks de R5 y R1 (las loopbacks filtradas no deben responder fuera de R5).
  - `traceroute` para confirmar el path OSPF → R4 → EIGRP.

# Conclusión

El laboratorio integra dos protocolos de enrutamiento y demuestra cómo `route-map` y `prefix-list` permiten decidir exactamente qué rutas cruzan el router de borde. También cubre las diferencias entre IPv4 e IPv6: redistribución con métricas explícitas y route-maps en IPv4, redistribución directa con `include-connected` en IPv6.

Los puntos críticos al reproducirlo son: aplicar la `prefix-list` en la interfaz correcta y en la dirección correcta (`in`/`out`), no olvidar el `permit` final que evita el deny implícito, alinear los prefijos del filtro con la dirección de red real, y recordar que las loopbacks OSPF necesitan `ip ospf network point-to-point` para anunciarse con su máscara verdadera.
