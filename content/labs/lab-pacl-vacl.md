+++
draft = false
title = "Implementación de PACL y VACL"
date = 2026-11-09T12:00:00Z
description = "Laboratorio de seguridad de capa 2: VLANs, EtherChannel, port-security, PACL para bloquear un puerto y VACL para aislar tráfico entre VLANs, con EIGRP, OSPF, DHCP y NAT."
weight = 9
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #PACL #VACL #ACL #VLAN #EtherChannel #NAT
---

# Introducción

Este laboratorio combina una red de campus segmentada con **seguridad de capa 2 y capa 3**. El objetivo central es implementar dos mecanismos de filtrado que se aplican en puntos distintos de la red:

- **PACL** (*Port ACL*): una ACL aplicada a un puerto de switch. Filtra el tráfico que entra por ese puerto, sin importar la VLAN.
- **VACL** (*VLAN ACL*): una ACL aplicada a una VLAN completa. Filtra el tráfico dentro de la VLAN y también el que se puentea entre VLANs.

Además se practica:

- VLANs y troncales 802.1Q con VLAN nativa.
- EtherChannel con PAgP, LACP y modo estático.
- Rapid PVST+ y port-security.
- Routing inter-VLAN con SVIs.
- EIGRP y OSPF con redistribución.
- DHCP IPv4 e IPv6.
- NAT de salida a Internet.

# Topología

<img src="/images/Pasted image 20250620180540.png" style="width:100%; height:auto; display:block; margin:auto;">

- **R3**: router de borde con salida al ISP (`205.0.0.0/30`) y enlace hacia R2 (`172.16.23.0/24`). OSPF área 0.
- **R2**: router intermedio. Corre EIGRP hacia MLS y OSPF hacia R3; además es el servidor DHCP.
- **MLS**: switch multilayer que hace el routing inter-VLAN y concentra los port-channels hacia SWA y SWB.
- **SWA, SWB, SWC, SWD y SWE**: switches de acceso con enlaces redundantes.
- **PC80, PC90 y PC100**: equipos finales en las VLAN 80, 90 y 100.

| VLAN | Nombre | IPv4 | IPv6 |
|---|---|---|---|
| 70 | ADM | `172.16.70.0/24` | `3001:ABCD:ABCD:70::/64` |
| 80 | RRHH | `172.16.80.0/24` | `3001:ABCD:ABCD:75::/64` |
| 90 | Ventas | `172.16.90.0/24` | `3001:ABCD:ABCD:80::/64` |
| 100 | Finanzas | `172.16.100.0/24` | `3001:ABCD:ABCD:85::/64` |
| 200 | Nativa | — | — |

> Los prefijos IPv6 de las VLAN avanzan de 5 en 5 (70, 75, 80, 85). Es la numeración usada en este laboratorio.

# Requerimientos

- Crear los dominios de broadcast (VLAN 70, 80, 90, 100 y 200) en todos los switches.
- Implementar EtherChannel con los grupos solicitados.
- Habilitar Rapid PVST+ en todos los switches de capa 2.
- En los switches de acceso, limitar a 2 MAC por puerto y apagar el puerto ante violación.
- Los puertos de acceso no deben enviar ni recibir BPDUs.
- **PC de VLAN 80** no puede comunicarse con ningún equipo de la infraestructura; se resuelve **a nivel de interfaz**.
- **PC de VLAN 90** no puede comunicarse con **PC de VLAN 100**; se resuelve **a nivel de VLAN**.
- Hacer el routing inter-VLAN en los equipos adecuados.
- Implementar EIGRP y OSPF en IPv4 e IPv6.
- R2 es el servidor DHCP IPv4 e IPv6.
- Permitir salida a Internet en IPv4 e IPv6; en IPv4 el tráfico debe salir traducido por IP pública.
- Comprobar conectividad y el funcionamiento de los bloqueos.

# Desarrollo

## 1. VLANs y VTP transparente

```bash
en
conf t
vlan 70,80,90,100,200
ex
vtp mode transparent
```

> Repite el bloque en **SWA, SWB, SWC, SWD, SWE y MLS**.

## 2. Puertos de acceso con port-security

Los puertos hacia los equipos finales aprenden como máximo **2 MAC** y se apagan ante una violación. Además se aplican los mecanismos de estabilización de STP.

**SWC** — PC80 en VLAN 80

```bash
int e0/3
sw mo acc
sw acc vlan 80
sw port-security
switchport port-security mac-address sticky
switchport port-security maximum 2
switchport port-security violation shutdown
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

**SWD** — PC90 en VLAN 90

```bash
int e0/3
sw mo acc
sw acc vlan 90
sw port-security
switchport port-security mac-address sticky
switchport port-security maximum 2
switchport port-security violation shutdown
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

**SWE** — PC100 en VLAN 100

```bash
int e0/3
sw mo acc
sw acc vlan 100
sw port-security
switchport port-security mac-address sticky
switchport port-security maximum 2
switchport port-security violation shutdown
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

## 3. Troncales con VLAN nativa 200

Los enlaces entre switches transportan las VLAN 70, 80, 90 y 100; la VLAN 200 se usa como nativa. Se desactiva DTP con `nonegotiate`.

**SWA**

```bash
int ran e1/0-3, e0/1-2
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 70,80,90,100
sw nonegotiate
sw tr native vlan 200
no shut
ex
```

**SWB**

```bash
int ran e1/0-3, e0/1-2
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 70,80,90,100
sw nonegotiate
sw tr native vlan 200
no shut
ex
```

**SWC**

```bash
int ran e1/2-3
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 70,80,90,100
sw nonegotiate
sw tr native vlan 200
no shut
ex
```

**SWD**

```bash
int ran e1/0-3
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 70,80,90,100
sw nonegotiate
sw tr native vlan 200
no shut
ex
```

**SWE**

```bash
int ran e0/1-2
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 70,80,90,100
sw nonegotiate
sw tr native vlan 200
no shut
ex
```

**MLS**

```bash
int ran e0/1-2, e1/0-1
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 70,80,90,100
sw nonegotiate
sw tr native vlan 200
no shut
ex
```

## 4. EtherChannel

| Port-channel | Switches | Modo | Interfaces |
|---|---|---|---|
| Po1 | MLS-SWA | PAgP desirable/auto | e0/1-2 |
| Po2 | MLS-SWB | LACP active/passive | e1/0-1 |
| Po3 | SWA-SWC | Estático `on` | e1/2-3 |
| Po4 | SWA-SWD | LACP active/passive | e1/0-1 |
| Po5 | SWB-SWD | Estático `on` | e1/2-3 |
| Po6 | SWB-SWE | PAgP desirable/auto | e0/1-2 |

**MLS**

```bash
int ran e0/1-2
channel-group 1 mode desirable
ex
int ran e1/0-1
channel-group 2 mode active
ex
```

**SWA**

```bash
int ran e0/1-2
channel-group 1 mode auto
ex
int ran e1/2-3
channel-group 3 mode on
ex
int ran e1/0-1
channel-group 4 mode active
ex
```

**SWB**

```bash
int ran e1/0-1
channel-group 2 mode passive
ex
int ran e1/2-3
channel-group 5 mode on
ex
int ran e0/1-2
channel-group 6 mode desirable
ex
```

**SWC**

```bash
int ran e1/2-3
channel-group 3 mode on
ex
```

**SWD**

```bash
int ran e1/0-1
channel-group 4 mode passive
ex
int ran e1/2-3
channel-group 5 mode on
ex
```

**SWE**

```bash
int ran e0/1-2
channel-group 6 mode auto
ex
```

## 5. Rapid PVST+ y administración remota

Se habilita Rapid PVST+ en todos los switches y se asigna una SVI de administración en la VLAN 70, con gateway en la SVI del MLS (`172.16.70.1`).

**MLS**

```bash
spanning-tree mode rapid-pvst
```

**SWA** — `172.16.70.2`

```bash
spanning-tree mode rapid-pvst
int vlan 70
ip add 172.16.70.2 255.255.255.0
no shut
ex
ip default-gateway 172.16.70.1
```

**SWB** — `172.16.70.3`

```bash
spanning-tree mode rapid-pvst
int vlan 70
ip add 172.16.70.3 255.255.255.0
no shut
ex
ip default-gateway 172.16.70.1
```

**SWC** — `172.16.70.4`

```bash
spanning-tree mode rapid-pvst
int vlan 70
ip add 172.16.70.4 255.255.255.0
no shut
ex
ip default-gateway 172.16.70.1
```

**SWD** — `172.16.70.5`

```bash
spanning-tree mode rapid-pvst
int vlan 70
ip add 172.16.70.5 255.255.255.0
no shut
ex
ip default-gateway 172.16.70.1
```

**SWE** — `172.16.70.6`

```bash
spanning-tree mode rapid-pvst
int vlan 70
ip add 172.16.70.6 255.255.255.0
no shut
ex
ip default-gateway 172.16.70.1
```

## 6. SVIs y routing inter-VLAN

El MLS es el gateway de cada VLAN. Se habilitan `ip routing` e `ipv6 unicast-routing`, y se crean las SVIs con la primera dirección de cada subred.

```bash
ip routing
ipv6 unicast-routing
int vlan 70
ip add 172.16.70.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:70::1/64
no shut
ex
int vlan 80
ip add 172.16.80.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:75::1/64
no shut
ex
int vlan 90
ip add 172.16.90.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:80::1/64
no shut
ex
int vlan 100
ip add 172.16.100.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:85::1/64
no shut
ex
```

El enlace del MLS hacia R2 se configura como puerto enrutado:

```bash
int e0/0
no switchport
ip add 172.16.12.1 255.255.255.0
ipv6 address 3001:ABCD:ABCD:12::1/112
no shut
ex
```

## 7. EIGRP AS 1 (MLS y R2)

**MLS**

```bash
router eigrp 1
eigrp router-id 1.1.1.1
network 172.16.12.0 255.255.255.0
network 172.16.70.0 255.255.255.0
network 172.16.80.0 255.255.255.0
network 172.16.90.0 255.255.255.0
network 172.16.100.0 255.255.255.0
passive-interface vlan 70
passive-interface vlan 80
passive-interface vlan 90
passive-interface vlan 100
ex
ipv6 router eigrp 1
eigrp router-id 1.1.1.1
passive-interface vlan 70
passive-interface vlan 80
passive-interface vlan 90
passive-interface vlan 100
ex
int e0/0
ipv6 eigrp 1
ex
int vlan 70
ipv6 eigrp 1
ex
int vlan 80
ipv6 eigrp 1
ex
int vlan 90
ipv6 eigrp 1
ex
int vlan 100
ipv6 eigrp 1
ex
```

**R2**

```bash
en
conf t
ipv6 unicast-routing
router eigrp 1
eigrp router-id 2.2.2.2
network 172.16.12.0 255.255.255.0
ex
ipv6 router eigrp 1
eigrp router-id 2.2.2.2
ex
int e0/0
ipv6 eigrp 1
ex
```

## 8. OSPF entre R2 y R3

**R2**

```bash
router ospf 1
router-id 2.2.2.2
network 172.16.23.0 0.0.0.255 area 0
ex
ipv6 router ospf 1
router-id 2.2.2.2
ex
int e0/1
ipv6 ospf 1 area 0
ex
```

**R3**

```bash
en
conf t
ipv6 unicast-routing
router ospf 1
router-id 3.3.3.3
network 172.16.23.0 0.0.0.255 area 0
ex
ipv6 router ospf 1
router-id 3.3.3.3
ex
int e0/1
ipv6 ospf 1 area 0
ex
```

## 9. Ruta por defecto y salida a Internet

R3 conoce al ISP por una ruta estática y la inyecta en OSPF.

**R3**

```bash
ip route 0.0.0.0 0.0.0.0 205.0.0.1
ipv6 route ::/0 3001:ABCD:ABCD:205::1
router ospf 1
default-information originate
ex
ipv6 router ospf 1
default-information originate
ex
```

**ISP** — ruta de retorno

```bash
en
conf t
ipv6 unicast-routing
ip route 0.0.0.0 0.0.0.0 205.0.0.2
ipv6 route ::/0 3001:ABCD:ABCD:205::2
```

## 10. Redistribución OSPF ↔ EIGRP

### IPv6: directa

**R2**

```bash
ipv6 router ospf 1
redistribute eigrp 1 include-connected
ex
ipv6 router eigrp 1
redistribute ospf 1 metric 10000 100 255 1 1500 include-connected
ex
```

### IPv4: con route-maps

**EIGRP → OSPF**

```bash
ip prefix-list RUTAS-EIGRP permit 172.16.12.0/24
ip prefix-list RUTAS-EIGRP permit 172.16.70.0/24
ip prefix-list RUTAS-EIGRP permit 172.16.80.0/24
ip prefix-list RUTAS-EIGRP permit 172.16.90.0/24
ip prefix-list RUTAS-EIGRP permit 172.16.100.0/24
route-map OSPF permit
match ip address prefix-list RUTAS-EIGRP
set metric-type type-1
ex
router ospf 1
redistribute eigrp 1 route-map OSPF subnets
ex
```

**OSPF → EIGRP**

```bash
ip prefix-list RUTAS-OSPF permit 172.16.23.0/24
ip prefix-list RUTAS-OSPF permit 0.0.0.0/0
route-map EIGRP permit
match ip address prefix-list RUTAS-OSPF
set metric 10000 100 255 1 1500
ex
router eigrp 1
redistribute ospf 1 route-map EIGRP
ex
```

> **Nota:** al redistribuir la ruta por defecto hay que incluir `0.0.0.0/0` en la `prefix-list`; de lo contrario no se propaga.

## 11. DHCP IPv4 e IPv6 en R2

**R2 — DHCP IPv4**

```bash
ip dhcp excluded-address 172.16.80.1 172.16.80.5
ip dhcp excluded-address 172.16.90.1 172.16.90.5
ip dhcp excluded-address 172.16.100.1 172.16.100.5
ip dhcp pool VLAN80
default-router 172.16.80.1
network 172.16.80.0 255.255.255.0
ex
ip dhcp pool VLAN90
default-router 172.16.90.1
network 172.16.90.0 255.255.255.0
ex
ip dhcp pool VLAN100
default-router 172.16.100.1
network 172.16.100.0 255.255.255.0
ex
```

**MLS — relay DHCP**

```bash
int vlan 80
ip helper-address 172.16.12.2
ex
int vlan 90
ip helper-address 172.16.12.2
ex
int vlan 100
ip helper-address 172.16.12.2
ex
```

**R2 — DHCPv6**

```bash
ipv6 dhcp pool VLAN90-V6
add prefix 3001:ABCD:ABCD:80::/64
dns-server ::8
ex
int e0/0
ipv6 dhcp server VLAN90-V6
ex
```

**MLS — relay DHCPv6 en VLAN 90**

```bash
int vlan 90
ipv6 nd managed-config-flag
ipv6 dhcp relay destination 3001:ABCD:ABCD:12::2
ex
```

## 12. NAT de salida en R3

El requerimiento pide que el tráfico IPv4 salga traducido por una IP pública. Se configura NAT *overload* en R3, usando como `outside` el enlace hacia el ISP y como `inside` el enlace hacia R2.

```bash
ip access-list standard NAT
permit 172.16.0.0 0.0.255.255
ex
ip nat inside source list NAT interface e0/2 overload
int e0/2
ip nat outside
ex
int e0/1
ip nat inside
ex
```

## 13. PACL: bloquear PC80 a nivel de interfaz

PC80 (VLAN 80) no debe comunicarse con **ningún** equipo de la infraestructura. La solución se aplica en el puerto del switch donde está conectado el PC (SWC `e0/3`).

### Paso 1: obtener la MAC de PC80

```bash
end
show mac address-table
```

<img src="/images/Pasted image 20250620221643.png" style="width:100%; height:auto; display:block; margin:auto;">

La MAC de PC80 es `AABB.CC00.0A30` y su IP es `172.16.80.6`.

### Paso 2: crear las ACL

Se crea una ACL de capa 2 (MAC) y una de capa 3 (IP). La primera bloquea por MAC y la segunda por IP; juntas evitan que PC80 alcance cualquier destino.

```bash
conf t
mac access-list extended L2
deny host AABB.CC00.0A30 any
permit any any
ex
ip access-list extended L3
deny ip host 172.16.80.6 any
permit ip any any
ex
```

### Paso 3: aplicar la PACL al puerto

```bash
int e0/3
mac access-group L2 in
ip access-group L3 in
ex
```

> Una PACL se aplica con `mac access-group` / `ip access-group` directamente en la interfaz. Solo filtra el tráfico que **entra** por ese puerto.

## 14. VACL: bloquear VLAN 90 ↔ VLAN 100

PC90 (VLAN 90) no debe comunicarse con PC100 (VLAN 100). Esta vez el filtro se aplica a nivel de VLAN con una **VACL**.

### Paso 1: obtener MAC e IP de ambos PC

**SWD** — PC90

```bash
end
show mac address-table
```

<img src="/images/Pasted image 20250620223929.png" style="width:100%; height:auto; display:block; margin:auto;">

- MAC: `AABB.CC00.0B30`
- IP: `172.16.90.6`

**SWE** — PC100

```bash
end
show mac address-table
```

<img src="/images/Pasted image 20250620223944.png" style="width:100%; height:auto; display:block; margin:auto;">

- MAC: `AABB.CC00.0C30`
- IP: `172.16.100.7`

### Paso 2: crear la VACL en SWD

La VACL se construye con un `vlan access-map`: la entrada 10 hace `drop` del tráfico que coincide con la ACL y la entrada 20 hace `forward` de todo lo demás.

```bash
conf t
ip access-list extended VACL-L3
permit ip host 172.16.90.6 host 172.16.100.7
ex
vlan access-map BLOQUEO 10
match ip address VACL-L3
action drop
ex
vlan access-map BLOQUEO 20
action forward
ex
vlan filter BLOQUEO vlan-list 90,100
```

## 15. Configuración de los equipos finales

En el laboratorio los PC son routers de EVE-NG. Reciben IPv4 por DHCP y usan IPv6 estático.

**PC80**

```bash
en
conf t
hostname PC80
ipv6 unicast-routing
ip route 0.0.0.0 0.0.0.0 172.16.80.1
ipv6 route ::/0 3001:ABCD:ABCD:75::1
int e0/3
ip address dhcp
ipv6 address 3001:ABCD:ABCD:75::B/64
no shut
ex
```

**PC90**

```bash
en
conf t
hostname PC90
ipv6 unicast-routing
ip route 0.0.0.0 0.0.0.0 172.16.90.1
ipv6 route ::/0 3001:ABCD:ABCD:80::1
int e0/3
ip address dhcp
ipv6 address 3001:ABCD:ABCD:80::B/64
no shut
ex
```

**PC100**

```bash
en
conf t
hostname PC100
ipv6 unicast-routing
ip route 0.0.0.0 0.0.0.0 172.16.100.1
ipv6 route ::/0 3001:ABCD:ABCD:85::1
int e0/3
ip address dhcp
ipv6 address 3001:ABCD:ABCD:85::B/64
no shut
ex
```

## Verificación

- **Capa 2**
  - `show vlan brief` — VLANs 70-100 y 200.
  - `show etherchannel summary` — Po1-Po6 en `SU`/`P`.
  - `show spanning-tree` — Rapid PVST+ activo.
  - `show port-security interface e0/3` — máximo 2 MAC y modo `Shutdown`.
- **Routing**
  - `show ip eigrp neighbors` — MLS-R2 en `Up`.
  - `show ip ospf neighbor` — R2-R3 en `FULL`.
  - `show ip route` — rutas EIGRP, OSPF y ruta por defecto.
  - `show ipv6 route`.
- **DHCP**
  - `show ip dhcp binding` en R2 — PC80/90/100 con IP.
  - En los PC, `show ip interface brief` debe mostrar la IP recibida.
  - `show ipv6 dhcp binding` y `show ipv6 dhcp pool`.
- **NAT**
  - `show ip nat translations` en R3 — traducciones de las IPs internas.
  - `show ip nat statistics`.
- **PACL**
  - Desde PC80: `ping 172.16.70.1` **debe fallar**.
  - Desde PC80: `ping 8.8.8.8` **debe fallar**.
  - Desde PC90 y PC100: `ping 172.16.70.1` **debe funcionar**.
- **VACL**
  - Desde PC90: `ping 172.16.100.7` **debe fallar**.
  - Desde PC90: `ping 172.16.80.6` debe funcionar (si PC80 no estuviera bloqueado por PACL).
  - Desde PC100: `ping 172.16.90.6` **debe fallar**.
  - `show vlan access-map` y `show vlan filter` — VACL aplicada a las VLAN 90 y 100.
- **Conectividad general**
  - `ping` entre PC90 y el gateway `172.16.90.1`.
  - `ping 205.0.0.1` y `ping 4.4.4.4` desde PC90/PC100 (salida a Internet).
  - `traceroute` para confirmar el path MLS → R2 → R3 → ISP.

# Conclusión

El laboratorio integra una red de campus completa con seguridad en dos niveles. La **PACL** bloquea un equipo específico en el puerto de acceso, mientras que la **VACL** aísla el tráfico entre dos VLANs sin depender del router.

Los puntos críticos al reproducirlo son: aplicar la PACL en el puerto correcto y en dirección `in`, aplicar la VACL en las VLANs involucradas, recordar que la VACL necesita una entrada final `action forward` para no bloquear el resto del tráfico, y verificar que la MAC/IP usadas en las ACL coincidan con las del equipo real (`show mac address-table`).
