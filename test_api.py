# test_api.py
import requests
import time
import json

# --- CONFIGURAÇÕES ---
API_URL = "http://localhost:3000"
# Email único para cada execução, usando timestamp
TEST_EMAIL = f"test-user-1754071610@example.com"
TEST_PASSWORD = "password123"
# IMPORTANTE: Mude para um número de WhatsApp válido para receber os testes
RECIPIENT_NUMBER = "554391964950"
MEDIA_URL = "https://wppconnect.io/assets/images/boy-image-0ee58a6a9928587b8fae998188e26499.png"

# Cores para o output no terminal
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'  # Sem Cor

def print_json(data):
    """Função para imprimir JSON formatado."""
    print(json.dumps(data, indent=2, ensure_ascii=False))

def main():
    """Função principal para executar os testes."""
    print(f"{BLUE}--- Iniciando Teste Completo da API WhatsApp ---{NC}")
    print(f"URL da API: {API_URL}")
    print(f"Email de Teste: {TEST_EMAIL}")
    print(f"Número Destino: {RECIPIENT_NUMBER}")
    print("")

    

    # --- PASSO 2: FAZER LOGIN E OBTER TOKEN ---
    print(f"{YELLOW}PASSO 2: Fazendo login e capturando o token JWT...{NC}")
    login_payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
    try:
        response = requests.post(f"{API_URL}/auth/login", json=login_payload)
        response.raise_for_status()

        if response.status_code == 200:
            token = response.json().get("token")
            if not token:
                print("ERRO: Token não encontrado na resposta do login.")
                return
            print(f"{GREEN}SUCESSO: Login bem-sucedido. Token capturado.{NC}")
        else:
            print(f"ERRO: Falha ao fazer login (HTTP Code: {response.status_code}).")
            print("Resposta:", response.text)
            return
    except requests.exceptions.RequestException as e:
        print(f"ERRO: Falha na requisição: {e}")
        return

    print("")

    headers = {"Authorization": f"Bearer {token}"}

    # --- PASSO 3: TESTANDO ENDPOINTS AUTENTICADOS ---

    # 3.1 Listar Planos Disponíveis
    print(f"{YELLOW}PASSO 3.1: Consultando planos disponíveis...{NC}")
    try:
        response = requests.get(f"{API_URL}/plan/available")
        response.raise_for_status()
        print_json(response.json())
    except requests.exceptions.RequestException as e:
        print(f"ERRO: {e}")
    print("\n")

    # 3.2 Verificar Status do Plano Atual
    print(f"{YELLOW}PASSO 3.2: Verificando status do plano atual...{NC}")
    try:
        response = requests.get(f"{API_URL}/plan/status", headers=headers)
        response.raise_for_status()
        print_json(response.json())
    except requests.exceptions.RequestException as e:
        print(f"ERRO: {e}")
    print("\n")

    # 3.3 Enviar Mensagem de Texto Simples
    print(f"{YELLOW}PASSO 3.3: Enviando mensagem de texto simples...{NC}")
    send_payload = {"to": RECIPIENT_NUMBER, "message": "Olá! 🤖 Este é um teste automatizado da API."}
    try:
        response = requests.post(f"{API_URL}/messages/send", headers=headers, json=send_payload)
        response.raise_for_status()
        print_json(response.json())
    except requests.exceptions.RequestException as e:
        print(f"ERRO: {e}")
    print("\n")

    # 3.4 Enviar Mensagem com Mídia
    print(f"{YELLOW}PASSO 3.4: Enviando mensagem com imagem...{NC}")
    media_payload = {"to": RECIPIENT_NUMBER, "message": "Teste de envio de imagem.", "media_url": MEDIA_URL}
    try:
        response = requests.post(f"{API_URL}/messages/send", headers=headers, json=media_payload)
        response.raise_for_status()
        print_json(response.json())
    except requests.exceptions.RequestException as e:
        print(f"ERRO: {e}")
    print("\n")

    # 3.5 Enviar Mensagens em Lote
    print(f"{YELLOW}PASSO 3.5: Enviando mensagens em lote...{NC}")
    batch_payload = {
        "contacts": [
            {"to": RECIPIENT_NUMBER, "message": "Mensagem em lote 1/2"},
            {"to": RECIPIENT_NUMBER, "message": "Mensagem em lote 2/2"}
        ]
    }
    try:
        response = requests.post(f"{API_URL}/messages/send-batch", headers=headers, json=batch_payload)
        response.raise_for_status()
        print_json(response.json())
    except requests.exceptions.RequestException as e:
        print(f"ERRO: {e}")
    print("\n")

    # 3.6 Consultar Histórico de Mensagens
    print(f"{YELLOW}PASSO 3.6: Consultando histórico de mensagens...{NC}")
    try:
        response = requests.get(f"{API_URL}/messages/history", headers=headers)
        response.raise_for_status()
        print_json(response.json())
    except requests.exceptions.RequestException as e:
        print(f"ERRO: {e}")
    print("\n")

    print(f"{BLUE}--- Teste Completo Finalizado ---{NC}")

if __name__ == "__main__":
    main()