import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SubmitButton } from "./SubmitButton"

describe("<SubmitButton />", () => {
  it("mostra o label e dispara onClick ao clicar", async () => {
    const onClick = vi.fn()
    render(<SubmitButton label="Entrar" onClick={onClick} />)

    const btn = screen.getByRole("button", { name: /entrar/i })
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("fica desabilitado e esconde o label enquanto carrega", () => {
    const onClick = vi.fn()
    render(<SubmitButton label="Entrar" loading onClick={onClick} />)

    expect(screen.getByRole("button")).toBeDisabled()
    expect(screen.queryByText("Entrar")).not.toBeInTheDocument()
  })
})
