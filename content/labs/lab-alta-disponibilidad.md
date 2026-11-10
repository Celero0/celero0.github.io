+++
draft = false
title = "Implementación de una Red con Alta Disponibilidad"
date = 2026-11-09T08:00:00Z
description = "Laboratorio de alta disponibilidad: VLANs, EtherChannel, Rapid PVST+, HSRPv2 para IPv4 e IPv6, IP SLA con tracking, EIGRP, DHCP relay, summarización y BGP."
weight = 8
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #HSRP #VRRP #AltaDisponibilidad #EtherChannel #EIGRP #BGP
---

# Introducción

Este laboratorio construye una red de campus **con alta disponibilidad** de punta a punta. Dos switches multilayer (MLS2 y MLS3) actúan como gateways redundantes para las VLANs de datos, mientras cuatro switches de acceso (SWA-SWD) forman una topología redundante con EtherChannel y Rapid PVST+.

La alta disponibilidad se logra en varias capas:

- **Capa 2**: enlaces agregados con LACP, PAgP y modo estático, más Rapid PVST+ para evitar bucles.
- **Capa 3**: HSRPv2 con dos grupos por VLAN (IPv4 e IPv6), prioridades opuestas y `preempt`.
- **Detección de fallas**: IP SLA que monitorea `8.8.8.8` y baja la prioridad de HSRP si el destino deja de responder.
- **Routing**: EIGRP AS 123, summarización hacia R1, ruta por defecto y BGP con el ISP.

# Topología

<img src="/images/Pasted image 20250618144947.png" style="width:100%; height:auto; display:block; margin:auto;">

- **R1**: router de borde del AS 65000. Conecta con MLS2 (`192.168.12.0/24`), MLS3 (`192.168.13.0/24`) y el ISP (`209.50.0.0/30`).
- **MLS2 y MLS3**: switches multilayer que hacen el routing inter-VLAN y el gateway redundante (HSRP).
- **SWA, SWB, SWC y SWD**: switches de acceso con enlaces redundantes y port-channels.
- **ISP (AS 100)**: proveedor con loopback `8.8.8.8/32`.
- **BR (AS 64800)**: router externo de prueba con loopback `10.0.71.1/32`.

| VLAN | Nombre | IPv4 | IPv6 |
|---|---|---|---|
| 21 | Informática | `10.0.21.0/24` | `3001:ABCD:ABCD:A::/64` |
| 22 | Servidores | `10.0.31.0/24` | `3001:ABCD:ABCD:B::/64` |
| 23 | Finanzas | `10.0.41.0/24` | `3001:ABCD:ABCD:C::/64` |
| 24 | Gestión | `10.0.51.0/24` | `3001:ABCD:ABCD:D::/64` |
| 25 | Administración | `10.0.61.0/24` | `3001:ABCD:ABCD:E::/64` |

# Requerimientos

- Crear las VLAN 21 a 25 en todos los switches.
- Asignar las interfaces en uso a su VLAN y apagar las sobrantes.
- Implementar port-security dinámica (MAC sticky).
- Agregar enlaces con LACP, PAgP y modo estático; un extremo negocia y el otro escucha.
- Permitir solo las VLAN de datos en los port-channels y desactivar DTP.
- Implementar Rapid PVST+ en todos los switches de capa 2.
- Estabilizar STP en los puertos de acceso.
- Administrar los switches por la VLAN 25.
- Hacer el routing inter-VLAN en los equipos adecuados.
- Implementar HSRPv2: IPv4 prefiere MLS2 e IPv6 prefiere MLS3.
- Modificar los temporizadores de HSRP.
- Implementar IP SLA sobre `8.8.8.8`: si cae, el tráfico IPv4 debe pasar al equipo de respaldo.
- Implementar EIGRP con el AS indicado y las interfaces pasivas necesarias.
- Sumarizar las rutas de los MLS hacia R1 en IPv4 e IPv6.
- Dar direccionamiento dinámico a los equipos finales desde R1.
- Permitir salida a Internet en IPv4 e IPv6.
- Implementar MP-BGP en IPv4 e IPv6, con las loopbacks como prefijos.
- Redistribuir IGP y EGP: IPv4 con route-maps, IPv6 de forma directa.
- Comprobar conectividad completa.

# Desarrollo

## 1. VLANs y VTP transparente

Se crean las cinco VLANs en los seis switches. En modo `transparent` cada switch mantiene su propia base de datos y no aprende VLANs por VTP.

```bash
en
conf t
vlan 21-25
ex
vtp mode transparent
```

> Repite el bloque en **SWA, SWB, SWC, SWD, MLS2 y MLS3**.

## 2. Puertos de acceso con port-security dinámica

Los puertos de acceso de SWC y SWD se configuran con port-security y MAC sticky, además de los mecanismos de estabilización de STP:

- `switchport port-security mac-address sticky`: aprende y fija la primera MAC que aparece.
- `spanning-tree bpduguard enable`: apaga el puerto si recibe un BPDU.
- `spanning-tree bpdufilter enable`: no envía ni procesa BPDUs.
- `spanning-tree portfast`: pasa el puerto a *forwarding* de inmediato.

**SWC**

```bash
int e0/2
sw mo acc
sw acc vlan 21
sw port-security
switchport port-security mac-address sticky
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
int e0/3
sw mo acc
sw acc vlan 22
sw port-security
switchport port-security mac-address sticky
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

**SWD**

```bash
int e0/2
sw mo acc
sw acc vlan 23
sw port-security
switchport port-security mac-address sticky
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
int e0/3
sw mo acc
sw acc vlan 24
sw port-security
switchport port-security mac-address sticky
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

## 3. Troncales 802.1Q

Todos los enlaces entre switches transportan las VLAN 21 a 25. Se desactiva DTP con `switchport nonegotiate` y se permite solo ese rango.

**SWA**

```bash
int ran e1/0-3, e0/0-1, e0/3
sw tr encapsu dot1q
sw mo tr
sw nonegotiate
sw tr all vlan 21,22,23,24,25
no shut
ex
```

**SWB**

```bash
int ran e1/0-3, e0/0-1, e0/3
sw tr encapsu dot1q
sw mo tr
sw nonegotiate
sw tr all vlan 21,22,23,24,25
no shut
ex
```

**SWC**

```bash
int ran e1/0-3, e0/0-1
sw tr encapsu dot1q
sw mo tr
sw nonegotiate
sw tr all vlan 21,22,23,24,25
no shut
ex
```

**SWD**

```bash
int ran e1/0-3, e0/0-1
sw tr encapsu dot1q
sw mo tr
sw nonegotiate
sw tr all vlan 21,22,23,24,25
no shut
ex
```

**MLS2 y MLS3** — enlace hacia el switch de acceso

```bash
int e0/3
sw tr encapsu dot1q
sw mo tr
sw nonegotiate
sw tr all vlan 21,22,23,24,25
no shut
ex
```

## 4. EtherChannel y Rapid PVST+

Los enlaces redundantes se agrupan en port-channels. Se usan los tres modos de negociación:

- `on`: estático, sin negociación (ambos extremos `on`).
- `active` / `passive`: LACP.
- `desirable` / `auto`: PAgP.

| Port-channel | Switches | Modo | Interfaces |
|---|---|---|---|
| Po6 | SWA-SWB | LACP active/passive | e1/0-1 |
| Po5 | SWA-SWC | Estático `on` | e1/2-3 |
| Po4 | SWB-SWC | PAgP desirable/auto | e0/0-1 |
| Po2 | SWA-SWD | LACP active/passive | e0/0-1 |
| Po3 | SWB-SWD | Estático `on` | e1/2-3 |
| Po1 | SWC-SWD | PAgP desirable/auto | e1/0-1 |

**SWA**

```bash
int ran e1/2-3
channel-group 5 mode on
ex
int ran e0/0-1
channel-group 2 mode active
ex
int ran e1/0-1
channel-group 6 mode active
ex
spanning-tree mode rapid-pvst
```

**SWB**

```bash
int ran e1/2-3
channel-group 3 mode on
ex
int ran e0/0-1
channel-group 4 mode desirable
ex
int ran e1/0-1
channel-group 6 mode passive
ex
spanning-tree mode rapid-pvst
```

**SWC**

```bash
int ran e1/2-3
channel-group 5 mode on
ex
int ran e0/0-1
channel-group 4 mode auto
ex
int ran e1/0-1
channel-group 1 mode desirable
ex
spanning-tree mode rapid-pvst
```

**SWD**

```bash
int ran e1/2-3
channel-group 3 mode on
ex
int ran e0/0-1
channel-group 2 mode passive
ex
int ran e1/0-1
channel-group 1 mode auto
ex
spanning-tree mode rapid-pvst
```

## 5. Administración remota por VLAN 25

Cada switch recibe una SVI en la VLAN 25 y un `default-gateway` que apunta a la IP virtual de HSRP (`10.0.61.1`).

**SWA** — `10.0.61.7`

```bash
int vlan 25
ip add 10.0.61.7 255.255.255.0
no shut
ex
ip default-gateway 10.0.61.1
```

**SWB** — `10.0.61.21`

```bash
int vlan 25
ip add 10.0.61.21 255.255.255.0
no shut
ex
ip default-gateway 10.0.61.1
```

**SWC** — `10.0.61.14`

```bash
int vlan 25
ip add 10.0.61.14 255.255.255.0
no shut
ex
ip default-gateway 10.0.61.1
```

**SWD** — `10.0.61.28`

```bash
int vlan 25
ip add 10.0.61.28 255.255.255.0
no shut
ex
ip default-gateway 10.0.61.1
```

## 6. SVIs y routing inter-VLAN

MLS2 y MLS3 tienen una SVI por VLAN. Cada uno usa la dirección `.2` o `.3` de la subred; la `.1` queda reservada para el gateway virtual de HSRP.

**MLS2**

```bash
int vlan 21
ip add 10.0.21.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:A::2/64
no shut
ex
int vlan 22
ip add 10.0.31.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:B::2/64
no shut
ex
int vlan 23
ip add 10.0.41.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:C::2/64
no shut
ex
int vlan 24
ip add 10.0.51.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:D::2/64
no shut
ex
int vlan 25
ip add 10.0.61.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:E::2/64
no shut
ex
```

**MLS3**

```bash
int vlan 21
ip add 10.0.21.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:A::3/64
no shut
ex
int vlan 22
ip add 10.0.31.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:B::3/64
no shut
ex
int vlan 23
ip add 10.0.41.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:C::3/64
no shut
ex
int vlan 24
ip add 10.0.51.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:D::3/64
no shut
ex
int vlan 25
ip add 10.0.61.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:E::3/64
no shut
ex
```

Habilitar el routing de capa 3 en ambos switches:

```bash
ip routing
ipv6 unicast-routing
```

Y configurar los enlaces enrutados hacia R1:

**MLS2** — `e0/1`

```bash
int e0/1
no switchport
ip add 192.168.12.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:12::2/64
no shut
ex
```

**MLS3** — `e0/2`

```bash
int e0/2
no switchport
ip add 192.168.13.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:13::3/64
no shut
ex
```

## 7. HSRPv2 (IPv4 e IPv6)

HSRP permite que dos switches compartan una IP virtual que actúa como gateway. La prioridad decide quién está activo; por defecto es 100 y **a mayor prioridad, mejor**. `preempt` permite recuperar el rol activo cuando el equipo vuelve.

En este laboratorio las preferencias son cruzadas:

- **IPv4**: MLS2 prioridad 120 (activo) y MLS3 prioridad 90 (respaldo).
- **IPv6**: MLS2 prioridad 90 y MLS3 prioridad 120 (activo).
- Temporizadores: `hello 200 ms`, `hold 800 ms`.

Los grupos IPv4 son 21-25 y los grupos IPv6 son 211, 222, 233, 244 y 255.

**MLS2**

```bash
int vlan 21
standby version 2
standby 21 ip 10.0.21.1
standby 21 priority 120
standby 21 preempt
standby 21 timers msec 200 msec 800
standby 211 ipv6 3001:ABCD:ABCD:A::1/64
standby 211 priority 90
standby 211 preempt
standby 211 timers msec 200 msec 800
ex
int vlan 22
standby version 2
standby 22 ip 10.0.31.1
standby 22 priority 120
standby 22 preempt
standby 22 timers msec 200 msec 800
standby 222 ipv6 3001:ABCD:ABCD:B::1/64
standby 222 priority 90
standby 222 preempt
standby 222 timers msec 200 msec 800
ex
int vlan 23
standby version 2
standby 23 ip 10.0.41.1
standby 23 priority 120
standby 23 preempt
standby 23 timers msec 200 msec 800
standby 233 ipv6 3001:ABCD:ABCD:C::1/64
standby 233 priority 90
standby 233 preempt
standby 233 timers msec 200 msec 800
ex
int vlan 24
standby version 2
standby 24 ip 10.0.51.1
standby 24 priority 120
standby 24 preempt
standby 24 timers msec 200 msec 800
standby 244 ipv6 3001:ABCD:ABCD:D::1/64
standby 244 priority 90
standby 244 preempt
standby 244 timers msec 200 msec 800
ex
int vlan 25
standby version 2
standby 25 ip 10.0.61.1
standby 25 priority 120
standby 25 preempt
standby 25 timers msec 200 msec 800
standby 255 ipv6 3001:ABCD:ABCD:E::1/64
standby 255 priority 90
standby 255 preempt
standby 255 timers msec 200 msec 800
ex
```

**MLS3**

```bash
int vlan 21
standby version 2
standby 21 ip 10.0.21.1
standby 21 priority 90
standby 21 preempt
standby 21 timers msec 200 msec 800
standby 211 ipv6 3001:ABCD:ABCD:A::1/64
standby 211 priority 120
standby 211 preempt
standby 211 timers msec 200 msec 800
ex
int vlan 22
standby version 2
standby 22 ip 10.0.31.1
standby 22 priority 90
standby 22 preempt
standby 22 timers msec 200 msec 800
standby 222 ipv6 3001:ABCD:ABCD:B::1/64
standby 222 priority 120
standby 222 preempt
standby 222 timers msec 200 msec 800
ex
int vlan 23
standby version 2
standby 23 ip 10.0.41.1
standby 23 priority 90
standby 23 preempt
standby 23 timers msec 200 msec 800
standby 233 ipv6 3001:ABCD:ABCD:C::1/64
standby 233 priority 120
standby 233 preempt
standby 233 timers msec 200 msec 800
ex
int vlan 24
standby version 2
standby 24 ip 10.0.51.1
standby 24 priority 90
standby 24 preempt
standby 24 timers msec 200 msec 800
standby 244 ipv6 3001:ABCD:ABCD:D::1/64
standby 244 priority 120
standby 244 preempt
standby 244 timers msec 200 msec 800
ex
int vlan 25
standby version 2
standby 25 ip 10.0.61.1
standby 25 priority 90
standby 25 preempt
standby 25 timers msec 200 msec 800
standby 255 ipv6 3001:ABCD:ABCD:E::1/64
standby 255 priority 120
standby 255 preempt
standby 255 timers msec 200 msec 800
ex
```

## 8. IP SLA y tracking

MLS2 monitorea `8.8.8.8` con IP SLA. Si el destino deja de responder, el objeto de tracking baja y HSRP resta 40 puntos a la prioridad IPv4 de MLS2 (120 → 80). Como MLS3 tiene 90, toma el rol activo.

**MLS2**

```bash
ip sla 1
icmp-echo 8.8.8.8
frequency 5
exit
ip sla schedule 1 start-time now life forever
track 1 ip sla 1 reachability
delay down 5 up 3
ex
```

Aplicar el tracking a cada grupo HSRP IPv4:

```bash
int vlan 21
standby 21 track 1 decrement 40
ex
int vlan 22
standby 22 track 1 decrement 40
ex
int vlan 23
standby 23 track 1 decrement 40
ex
int vlan 24
standby 24 track 1 decrement 40
ex
int vlan 25
standby 25 track 1 decrement 40
ex
```

## 9. EIGRP AS 123

MLS2, MLS3 y R1 corren EIGRP AS 123. Las SVIs de las VLANs se marcan como pasivas porque no tienen vecinos EIGRP; solo las interfaces hacia R1 forman vecindad.

**MLS2**

```bash
router eigrp 123
eigrp router-id 2.2.2.2
network 192.168.12.0 255.255.255.0
network 10.0.21.0 255.255.255.0
network 10.0.31.0 255.255.255.0
network 10.0.41.0 255.255.255.0
network 10.0.51.0 255.255.255.0
network 10.0.61.0 255.255.255.0
passive-interface vlan 21
passive-interface vlan 22
passive-interface vlan 23
passive-interface vlan 24
passive-interface vlan 25
ex
ipv6 router eigrp 123
eigrp router-id 2.2.2.2
passive-interface vlan 21
passive-interface vlan 22
passive-interface vlan 23
passive-interface vlan 24
passive-interface vlan 25
ex
int e0/1
ipv6 eigrp 123
ex
int vlan 21
ipv6 eigrp 123
ex
int vlan 22
ipv6 eigrp 123
ex
int vlan 23
ipv6 eigrp 123
ex
int vlan 24
ipv6 eigrp 123
ex
int vlan 25
ipv6 eigrp 123
ex
```

**MLS3**

```bash
router eigrp 123
eigrp router-id 3.3.3.3
network 192.168.13.0 255.255.255.0
network 10.0.21.0 255.255.255.0
network 10.0.31.0 255.255.255.0
network 10.0.41.0 255.255.255.0
network 10.0.51.0 255.255.255.0
network 10.0.61.0 255.255.255.0
passive-interface vlan 21
passive-interface vlan 22
passive-interface vlan 23
passive-interface vlan 24
passive-interface vlan 25
ex
ipv6 router eigrp 123
eigrp router-id 3.3.3.3
passive-interface vlan 21
passive-interface vlan 22
passive-interface vlan 23
passive-interface vlan 24
passive-interface vlan 25
ex
int e0/2
ipv6 eigrp 123
ex
int vlan 21
ipv6 eigrp 123
ex
int vlan 22
ipv6 eigrp 123
ex
int vlan 23
ipv6 eigrp 123
ex
int vlan 24
ipv6 eigrp 123
ex
int vlan 25
ipv6 eigrp 123
ex
```

**R1**

```bash
en
conf t
ipv6 unicast-routing
router eigrp 123
eigrp router-id 1.1.1.1
network 192.168.12.0 255.255.255.0
network 192.168.13.0 255.255.255.0
ex
int e0/1
ipv6 eigrp 123
ex
int e0/2
ipv6 eigrp 123
ex
```

## 10. DHCP y ip helper-address

R1 es el servidor DHCP de las VLANs de datos. Como los clientes están en otras subredes, MLS2 y MLS3 reenvían las peticiones con `ip helper-address` hacia R1.

**R1**

```bash
ip dhcp excluded-address 10.0.21.1 10.0.21.5
ip dhcp excluded-address 10.0.31.1 10.0.31.5
ip dhcp excluded-address 10.0.41.1 10.0.41.5
ip dhcp excluded-address 10.0.51.1 10.0.51.5
ip dhcp pool VLAN21
default-router 10.0.21.1
network 10.0.21.0 255.255.255.0
ex
ip dhcp pool VLAN22
default-router 10.0.31.1
network 10.0.31.0 255.255.255.0
ex
ip dhcp pool VLAN23
default-router 10.0.41.1
network 10.0.41.0 255.255.255.0
ex
ip dhcp pool VLAN24
default-router 10.0.51.1
network 10.0.51.0 255.255.255.0
ex
```

**MLS2**

```bash
int vlan 21
ip helper-address 192.168.12.1
ex
int vlan 22
ip helper-address 192.168.12.1
ex
int vlan 23
ip helper-address 192.168.12.1
ex
int vlan 24
ip helper-address 192.168.12.1
ex
```

**MLS3**

```bash
int vlan 21
ip helper-address 192.168.13.1
ex
int vlan 22
ip helper-address 192.168.13.1
ex
int vlan 23
ip helper-address 192.168.13.1
ex
int vlan 24
ip helper-address 192.168.13.1
ex
```

## 11. Summarización hacia R1

MLS2 y MLS3 resumen las subredes de las VLANs antes de anunciarlas a R1:

- **IPv4**: `10.0.0.0/18` cubre `10.0.0.0`–`10.0.63.255`, es decir, las VLAN 21-25.
- **IPv6**: `3001:ABCD:ABCD:8::/61` cubre los prefijos `A::` a `E::`.

**MLS2** — en `e0/1`

```bash
int e0/1
ip summary-address eigrp 123 10.0.0.0 255.255.192.0
ipv6 summary-address eigrp 123 3001:ABCD:ABCD:8::/61
ex
```

**MLS3** — en `e0/2`

```bash
int e0/2
ip summary-address eigrp 123 10.0.0.0 255.255.192.0
ipv6 summary-address eigrp 123 3001:ABCD:ABCD:8::/61
ex
```

## 12. Ruta por defecto y redistribución en EIGRP

R1 conoce al ISP por una ruta estática por defecto y la redistribuye en EIGRP para que toda la red interna sepa salir.

**R1**

```bash
ip route 0.0.0.0 0.0.0.0 209.50.0.2
ipv6 route ::/0 3001:ABCD:ABCD:209::2
router eigrp 123
redistribute static
ex
ipv6 router eigrp 123
redistribute static
ex
```

## 13. MP-BGP con el ISP y BR

R1 forma eBGP con el ISP (AS 100) en IPv4 e IPv6. El ISP también forma eBGP con BR (AS 64800), que anuncia su loopback como red de prueba.

**R1**

```bash
router bgp 65000
bgp router-id 1.1.1.1
address-family ipv4
neighbor 209.50.0.2 remote-as 100
ex
address-family ipv6
neighbor 3001:ABCD:ABCD:209::2 remote-as 100
ex
```

**ISP**

```bash
en
conf t
ipv6 unicast-routing
int e0/2
no shut
ex
router bgp 100
bgp router-id 8.8.8.8
address-family ipv4
neighbor 209.50.0.1 remote-as 65000
neighbor 219.50.0.1 remote-as 64800
network 8.8.8.8 mask 255.255.255.255
ex
address-family ipv6
neighbor 3001:ABCD:ABCD:209::1 remote-as 65000
neighbor 3001:ABCD:ABCD:219::1 remote-as 64800
network 3001:ABCD:ABCD:8::8/128
ex
```

**BR**

```bash
en
conf t
ipv6 unicast-routing
router bgp 64800
bgp router-id 10.0.71.1
address-family ipv4
neighbor 219.50.0.2 remote-as 100
network 10.0.71.1 mask 255.255.255.255
ex
address-family ipv6
neighbor 3001:ABCD:ABCD:219::2 remote-as 100
network 3001:ABCD:ABCD:71::1/128
ex
```

## 14. Redistribución BGP ↔ EIGRP

### IPv6: redistribución directa

**R1**

```bash
ipv6 router eigrp 123
redistribute bgp 65000 metric 10000 100 255 1 1500
ex
router bgp 65000
address-family ipv6
redistribute eigrp 123 metric 20
ex
```

### IPv4: redistribución con route-maps

**EIGRP → BGP**

```bash
ip prefix-list RUTAS-EIGRP permit 192.168.12.0/24
ip prefix-list RUTAS-EIGRP permit 192.168.13.0/24
ip prefix-list RUTAS-EIGRP permit 10.0.0.0/18
ip prefix-list RUTAS-EIGRP permit 0.0.0.0/0
route-map BGP permit
match ip address prefix-list RUTAS-EIGRP
set metric 50
ex
router bgp 65000
address-family ipv4
redistribute eigrp 123 route-map BGP
ex
```

**BGP → EIGRP**

```bash
ip prefix-list RUTAS-BGP permit 209.50.0.0/30
ip prefix-list RUTAS-BGP permit 219.50.0.0/30
ip prefix-list RUTAS-BGP permit 8.8.8.8/32
ip prefix-list RUTAS-BGP permit 10.0.71.1/32
route-map EIGRP permit
match ip address prefix-list RUTAS-BGP
set metric 10000 100 255 1 1500
ex
router eigrp 123
redistribute bgp 65000 route-map EIGRP
ex
```

## Verificación

- **Capa 2**
  - `show vlan brief` — VLANs 21-25 creadas y asignadas.
  - `show etherchannel summary` — port-channels en estado `SU`/`P`.
  - `show spanning-tree` — Rapid PVST+ activo y sin bucles.
  - `show port-security` — MAC sticky aprendidas.
- **HSRP**
  - `show standby brief` — MLS2 activo para IPv4 y MLS3 activo para IPv6.
  - `show standby vlan 21` — prioridades, timers y estado `Active`/`Standby`.
- **IP SLA**
  - `show ip sla statistics` — el ICMP a `8.8.8.8` debe estar `OK`.
  - `show track` — objeto de tracking en `Up`.
  - Al bloquear `8.8.8.8`, la prioridad de MLS2 debe bajar a 80 y MLS3 debe tomar el rol activo IPv4.
- **Routing**
  - `show ip eigrp neighbors` — vecindades MLS2/MLS3/R1.
  - `show ip route eigrp` y `show ipv6 route eigrp`.
  - `show ip route 10.0.0.0` en R1 — debe aparecer la ruta sumarizada `10.0.0.0/18`.
  - `show ip route 3001:ABCD:ABCD:8::/61` en R1.
- **DHCP**
  - `show ip dhcp binding` en R1.
  - `show ip dhcp pool`.
  - En los PC, `ipconfig` debe mostrar gateway `10.0.21.1` (VIP de HSRP).
- **BGP y conectividad**
  - `show ip bgp summary` — sesiones con AS 100 y AS 64800 en `Established`.
  - `show ip bgp` — loopbacks `8.8.8.8/32` y `10.0.71.1/32`.
  - `ping 8.8.8.8` y `ping 10.0.71.1` desde un PC.
  - `traceroute` para confirmar el path PC → MLS → R1 → ISP.

# Conclusión

El laboratorio integra alta disponibilidad en todas las capas: EtherChannel y Rapid PVST+ en capa 2, HSRPv2 con preferencias cruzadas IPv4/IPv6 en capa 3, IP SLA con tracking para detectar fallas de salida, EIGRP con summarización, DHCP relay y BGP con el ISP.

Los puntos críticos al reproducirlo son: que los dos extremos del EtherChannel usen modos compatibles, que las prioridades de HSRP estén invertidas entre IPv4 e IPv6, que el `decrement` del tracking deje la prioridad por debajo del respaldo, que el `ip helper-address` apunte a R1, y que las rutas sumarizadas cubran exactamente las VLANs anunciadas.
