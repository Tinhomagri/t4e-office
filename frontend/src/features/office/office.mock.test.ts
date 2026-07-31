import { describe, expect, it } from "vitest"

import {
  MOCK_DELIVERY_CHAMPION,
  MOCK_DESK_ASSIGNMENTS,
  MOCK_MEMBERS,
  getMockActiveCard,
  getMockRoom,
} from "./office.mock"
import { buildFloor } from "./world/floors"

describe("mock do escritório", () => {
  it("posiciona cada participante em uma cadeira do primeiro andar", () => {
    const floor = buildFloor(1)
    const occupiedSeats = new Set(
      MOCK_MEMBERS.map((member) => `${member.x * floor.width}:${member.y * floor.height}`),
    )

    expect(MOCK_MEMBERS).toHaveLength(24)
    expect(occupiedSeats.size).toBe(MOCK_MEMBERS.length)
    expect(occupiedSeats.size).toBeLessThanOrEqual(floor.seats.length)
    expect(getMockRoom(1)).toEqual(MOCK_MEMBERS)
    expect(getMockRoom(2)).toEqual([])
    expect(MOCK_DESK_ASSIGNMENTS).toHaveLength(MOCK_MEMBERS.length)
  })

  it("fornece um card ativo para cada pessoa do cenário", () => {
    for (const member of MOCK_MEMBERS) {
      expect(getMockActiveCard(member.user_id)?.active).toBe(true)
    }
  })

  it("expõe um campeão de entregas com avatar para o dirigível", () => {
    expect(MOCK_DELIVERY_CHAMPION.deliveries).toBeGreaterThan(0)
    expect(MOCK_DELIVERY_CHAMPION.avatar_config).not.toBeNull()
  })
})
