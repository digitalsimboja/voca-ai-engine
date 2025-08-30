#!/bin/bash

# Voca AI Engine - Service Management Script
# This script allows you to start individual services or all services together

set -e

# Ensure associative arrays are supported
if [[ ${BASH_VERSINFO[0]} -lt 4 ]]; then
    echo "Error: This script requires Bash 4.0 or later"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Service configurations with descriptions
declare -A SERVICES=(
    ["engine"]="Voca AI Engine - Main FastAPI application - Port 5008"
    ["voca-os"]="Voca OS - Node.js Agent Service - Port 5001"
    ["voca-connect"]="Voca Connect - FastAPI AWS Connect Service - Port 5002"
)

# URL prefixes for each service
declare -A URL_PREFIXES=(
    ["engine"]="v1/voca-engine"
    ["voca-os"]="v1/voca-os"
    ["voca-connect"]="v1/voca-connect"
)

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_header() {
    echo -e "${PURPLE}🚀 $1${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check if docker compose is available
check_docker_compose() {
    if ! command -v docker compose &> /dev/null; then
        print_error "docker compose is not installed. Please install it and try again."
        exit 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [SERVICE_NAME]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -l, --list          List all available services"
    echo "  -a, --all           Start all services"
    echo "  -d, --down          Stop all services"
    echo "  -r, --restart       Restart all services"
    echo "  -s, --status        Show status of all services"
    echo "  -c, --clean         Stop and remove all containers and volumes"
    echo ""
    echo "Service Names:"
    for service in "${!SERVICES[@]}"; do
        echo "  $service        ${SERVICES[$service]}"
    done
    echo ""
    echo "Examples:"
    echo "  $0 engine                    # Start engine service only"
    echo "  $0 --all                     # Start all services"
    echo "  $0 --status                  # Show status of all services"
    echo "  $0 --down                    # Stop all services"
    echo "  $0 engine voca-os            # Start engine and voca-os services"
}

# Function to list services
list_services() {
    print_header "Available Voca AI Engine Services:"
    echo ""
    for service in "${!SERVICES[@]}"; do
        echo -e "${CYAN}$service${NC}: ${SERVICES[$service]}"
    done
    echo ""
    print_info "Use '$0 <service_name>' to start a specific service"
    print_info "Use '$0 --all' to start all services"
    print_info "Use '$0 --status' to check service status"
}

# Function to start database
start_database() {
    print_info "Starting PostgreSQL database..."
    docker compose up -d postgres
    
    # Wait for database to be healthy
    print_info "Waiting for database to be ready..."
    timeout=60
    counter=0
    while [ $counter -lt $timeout ]; do
        if docker compose ps postgres | grep -q "healthy"; then
            print_status "Database is ready!"
            return 0
        fi
        sleep 2
        counter=$((counter + 2))
    done
    
    print_error "Database failed to start within $timeout seconds"
    return 1
}

# Function to start a specific service
start_service() {
    local service=$1
    local service_name=""
    
    # Map service names to container names
    case $service in
        "engine")
            service_name="voca-ai-engine"
            ;;
        "voca-os")
            service_name="voca-ai-engine-voca-os"
            ;;
        "voca-connect")
            service_name="voca-ai-engine-voca-connect"
            ;;
        *)
            print_error "Unknown service: $service"
            echo "Available services: ${!SERVICES[*]}"
            exit 1
            ;;
    esac
    
    if [[ ! ${SERVICES[$service]+_} ]]; then
        print_error "Unknown service: $service"
        echo "Available services: ${!SERVICES[*]}"
        exit 1
    fi
    
    print_header "Starting ${SERVICES[$service]}"
    
    # Start database if not running
    if ! docker compose ps postgres | grep -q "Up"; then
        start_database
    fi
    
    # Start the service
    docker compose --profile $service up -d
    
    # Wait for service to be healthy
    print_info "Waiting for service to be ready..."
    timeout=120
    counter=0
    while [ $counter -lt $timeout ]; do
        if docker compose ps $service_name | grep -q "Up"; then
            # Get the port for the service
            local port=""
            case $service in
                "engine")
                    port="5008"
                    ;;
                "voca-os")
                    port="5001"
                    ;;
                "voca-connect")
                    port="5002"
                    ;;
            esac
            
            # Check health endpoint
            local health_url="http://localhost:$port/health"
            
            if curl -f "$health_url" > /dev/null 2>&1; then
                print_status "${SERVICES[$service]} is running at http://localhost:$port"
                print_info "Health check: $health_url"
                if [[ $service == "engine" ]]; then
                    print_info "API docs: http://localhost:$port/docs"
                fi
                return 0
            fi
        fi
        sleep 2
        counter=$((counter + 2))
    done
    
    print_warning "Service may still be starting. Check logs with: docker compose logs $service_name"
    return 0
}

# Function to start all services
start_all_services() {
    print_header "Starting all Voca AI Engine services..."
    
    # Start database first
    start_database
    
    # Start all services by building the profile arguments correctly
    local profile_args=""
    for service in "${!SERVICES[@]}"; do
        profile_args="$profile_args --profile $service"
    done
    
    print_info "Starting services with profiles: ${!SERVICES[*]}"
    docker compose $profile_args up -d
    
    # Wait for services to be ready
    print_info "Waiting for services to be ready..."
    sleep 10
    
    # Check service status
    print_header "Service Status:"
    for service in "${!SERVICES[@]}"; do
        local service_name=""
        case $service in
            "engine")
                service_name="voca-ai-engine"
                port="5008"
                ;;
            "voca-os")
                service_name="voca-ai-engine-voca-os"
                port="5001"
                ;;
            "voca-connect")
                service_name="voca-ai-engine-voca-connect"
                port="5002"
                ;;
        esac
        
        if docker compose ps $service_name | grep -q "Up"; then
            # Check health endpoint
            if curl -f "http://localhost:$port/health" > /dev/null 2>&1; then
                print_status "${SERVICES[$service]} - http://localhost:$port"
                print_info "  Health: http://localhost:$port/health"
                if [[ $service == "engine" ]]; then
                    print_info "  API docs: http://localhost:$port/docs"
                fi
            else
                print_warning "${SERVICES[$service]} - Starting (http://localhost:$port)"
            fi
        else
            print_error "${SERVICES[$service]} - Not running"
        fi
    done
    
    print_info "Database: localhost:5433 (use TablePlus or your preferred client)"
}

# Function to show status
show_status() {
    print_header "Voca AI Engine Services Status:"
    echo ""
    
    # Database status
    if docker compose ps postgres | grep -q "Up"; then
        print_status "PostgreSQL Database - Running (localhost:5433)"
    else
        print_error "PostgreSQL Database - Not running"
    fi
    
    echo ""
    
    # Service status
    for service in "${!SERVICES[@]}"; do
        local service_name=""
        case $service in
            "engine")
                service_name="voca-ai-engine"
                port="5008"
                ;;
            "voca-os")
                service_name="voca-ai-engine-voca-os"
                port="5001"
                ;;
            "voca-connect")
                service_name="voca-ai-engine-voca-connect"
                port="5002"
                ;;
        esac
        
        if docker compose ps $service_name | grep -q "Up"; then
            # Check health endpoint
            if curl -f "http://localhost:$port/health" > /dev/null 2>&1; then
                print_status "${SERVICES[$service]} - Running (http://localhost:$port)"
                print_info "  Health: http://localhost:$port/health"
                if [[ $service == "engine" ]]; then
                    print_info "  API docs: http://localhost:$port/docs"
                fi
            else
                print_warning "${SERVICES[$service]} - Starting (http://localhost:$port)"
            fi
        else
            print_error "${SERVICES[$service]} - Not running"
        fi
    done
    
    echo ""
    print_info "Use '$0 --down' to stop all services"
    print_info "Use '$0 --clean' to remove all containers and volumes"
}

# Function to stop all services
stop_all_services() {
    print_header "Stopping all Voca AI Engine services..."
    docker compose down
    print_status "All services stopped"
}

# Function to restart all services
restart_all_services() {
    print_header "Restarting all Voca AI Engine services..."
    docker compose down
    start_all_services
}

# Function to clean up
clean_up() {
    print_header "Cleaning up all Voca AI Engine services..."
    print_warning "This will remove all containers, networks, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose down -v
        print_status "All containers, networks, and volumes removed"
    else
        print_info "Cleanup cancelled"
    fi
}

# Main script logic
main() {
    # Check prerequisites
    check_docker
    check_docker_compose
    
    # Parse arguments
    if [ $# -eq 0 ]; then
        show_usage
        exit 1
    fi
    
    case "$1" in
        -h|--help)
            show_usage
            ;;
        -l|--list)
            list_services
            ;;
        -a|--all)
            start_all_services
            ;;
        -d|--down)
            stop_all_services
            ;;
        -r|--restart)
            restart_all_services
            ;;
        -s|--status)
            show_status
            ;;
        -c|--clean)
            clean_up
            ;;
        *)
            # Start specific services
            for service in "$@"; do
                start_service "$service"
            done
            ;;
    esac
}

# Run main function with all arguments
main "$@"
